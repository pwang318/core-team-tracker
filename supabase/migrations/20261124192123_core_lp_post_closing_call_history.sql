begin;

create table if not exists public.core_lp_post_closing_calls (
  request_id uuid primary key,
  loan_key text not null,
  milestone smallint not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  complete boolean not null,
  evidence jsonb not null,
  foreign key (loan_key, milestone) references public.core_lp_post_closing_tasks (loan_key, milestone)
);
create index if not exists core_lp_post_closing_call_timeline
  on public.core_lp_post_closing_calls (loan_key, milestone, recorded_at);
create unique index if not exists core_lp_post_closing_one_completion
  on public.core_lp_post_closing_calls (loan_key, milestone) where complete;

alter table public.core_lp_post_closing_calls enable row level security;
revoke all on public.core_lp_post_closing_calls from public, anon, authenticated;
grant select on public.core_lp_post_closing_calls to authenticated;

drop policy if exists core_lp_post_closing_call_read on public.core_lp_post_closing_calls;
create policy core_lp_post_closing_call_read
  on public.core_lp_post_closing_calls for select to authenticated
  using (exists (
    select 1 from public.core_lp_post_closing_tasks t
    where t.loan_key = core_lp_post_closing_calls.loan_key
      and t.milestone = core_lp_post_closing_calls.milestone
  ));

create or replace function core_lp_private.record_post_closing_call(
  p_request_id uuid, p_loan_key text, p_milestone integer, p_complete boolean, p_evidence jsonb
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  member text;
  owner text;
  topics text[];
  previous public.core_lp_post_closing_calls%rowtype;
  saved_at timestamptz;
begin
  select member_name into member from public.core_lp_members where user_id = actor;
  if member is null or member = 'Daniel' then
    raise exception 'Team assignment access is required.' using errcode = '42501';
  end if;

  select verified_owner into owner from public.core_lp_funded_loans
    where loan_key = p_loan_key for update;
  if not found or owner is null or (member <> 'Mack' and member <> owner) then
    raise exception 'This loan is unavailable to the current user.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.core_lp_post_closing_tasks
      where loan_key = p_loan_key and milestone = p_milestone) then
    raise exception 'The assigned milestone could not be found.' using errcode = '22023';
  end if;
  if p_request_id is null or p_complete is null
     or jsonb_typeof(p_evidence) is distinct from 'object' then
    raise exception 'Call evidence and a request ID are required.' using errcode = '22023';
  end if;

  select * into previous from public.core_lp_post_closing_calls where request_id = p_request_id;
  if found then
    if previous.recorded_by = actor and previous.loan_key = p_loan_key
       and previous.milestone = p_milestone and previous.complete = p_complete
       and previous.evidence = p_evidence then
      return previous.recorded_at;
    end if;
    raise exception 'The request ID has already been used.' using errcode = '22023';
  end if;
  if exists (select 1 from public.core_lp_post_closing_calls
      where loan_key = p_loan_key and milestone = p_milestone and complete) then
    raise exception 'This milestone is already complete.' using errcode = '22023';
  end if;

  if p_complete then
    topics := case p_milestone
      when 30 then array['settling-in','mortgage-statement','first-payment-and-servicing','questions-and-concerns','offer-of-assistance']
      when 60 then array['settling-in','servicing-transfer-and-payment','mortgage-questions','approved-rate-drop-pledge','offer-of-assistance']
      when 90 then array['homeowner-experience','homeowner-needs','financing-questions','future-assistance','offer-of-assistance']
    end;
    if (p_evidence->>'outcome' = 'live'
        and p_evidence->'asked' = 'true'::jsonb
        and jsonb_typeof(p_evidence->'topics') = 'array'
        and (p_evidence->'topics') ?& topics
        and p_evidence->>'response' in ('none','declined','named')
        and jsonb_typeof(p_evidence->'notes') = 'string'
        and btrim(p_evidence->>'notes') <> ''
        and jsonb_typeof(p_evidence->'nextSteps') = 'string'
        and btrim(p_evidence->>'nextSteps') <> ''
        and (p_evidence->>'response' <> 'named'
          or (jsonb_typeof(p_evidence->'crmRef') = 'string'
            and btrim(p_evidence->>'crmRef') ~ '^[A-Za-z0-9_-]{6,80}$'))) is not true then
      raise exception 'Completion requires live contact, required topics, referral response, notes, next steps, and a CRM reference for named referrals.' using errcode = '22023';
    end if;
  elsif (p_evidence->>'outcome' in ('live','voicemail','unanswered','email','text','follow-up','client-concern')
      and jsonb_typeof(p_evidence->'notes') = 'string'
      and btrim(p_evidence->>'notes') <> ''
      and case when p_evidence->>'followUp' ~ '^\d{4}-\d{2}-\d{2}$'
        then (p_evidence->>'followUp')::date >= (statement_timestamp() at time zone 'America/New_York')::date
        else false end) is not true then
    raise exception 'Attempts require an outcome, notes, and a valid follow-up date.' using errcode = '22023';
  end if;

  insert into public.core_lp_post_closing_calls
    (request_id, loan_key, milestone, recorded_by, complete, evidence)
    values (p_request_id, p_loan_key, p_milestone, actor, p_complete, p_evidence)
    returning recorded_at into saved_at;
  return saved_at;
end;
$$;

revoke all on function core_lp_private.record_post_closing_call(uuid, text, integer, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function core_lp_private.record_post_closing_call(uuid, text, integer, boolean, jsonb) to authenticated;

create or replace function public.core_lp_record_post_closing_call(
  p_request_id uuid, p_loan_key text, p_milestone integer, p_complete boolean, p_evidence jsonb
) returns timestamptz
language sql
security invoker
set search_path = ''
as $$
  select core_lp_private.record_post_closing_call(p_request_id, p_loan_key, p_milestone, p_complete, p_evidence);
$$;

revoke all on function public.core_lp_record_post_closing_call(uuid, text, integer, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.core_lp_record_post_closing_call(uuid, text, integer, boolean, jsonb) to authenticated;

commit;
