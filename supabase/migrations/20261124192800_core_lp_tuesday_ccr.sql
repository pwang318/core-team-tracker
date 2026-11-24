begin;

create table if not exists public.core_lp_tuesday_assignments (
  loan_key text not null check (loan_key ~ '^([0-9a-f]{20}|fnv[0-9a-f]+)$'),
  due_on date not null check (extract(isodow from due_on) = 2),
  owner text not null check (owner in ('Gavin','Karen','Osgood','Jordan','Said','Isaak')),
  source_reference text not null check (length(btrim(source_reference)) between 1 and 120),
  agent_exempt boolean not null default false,
  primary key (loan_key, due_on)
);

create table if not exists public.core_lp_tuesday_contacts (
  request_id uuid primary key,
  loan_key text not null,
  due_on date not null,
  recorded_by uuid not null default auth.uid(),
  recorded_at timestamptz not null default clock_timestamp(),
  complete boolean not null,
  borrower_outcome text not null check (borrower_outcome in ('live','voicemail','unanswered','email','text','follow-up')),
  agent_outcome text not null check (agent_outcome in ('live','voicemail','unanswered','email','text','pending','exempt')),
  ccr_asked boolean not null default false,
  ccr_response text check (ccr_response in ('none','declined','potential','named','returning-client')),
  crm_reference text,
  notes text not null check (length(btrim(notes)) between 1 and 4000),
  next_steps text not null check (length(btrim(next_steps)) between 1 and 4000),
  foreign key (loan_key, due_on) references public.core_lp_tuesday_assignments (loan_key, due_on),
  check (not complete or (
    borrower_outcome = 'live' and agent_outcome in ('live','exempt')
    and ccr_asked and ccr_response is not null and ccr_response <> 'returning-client'
    and (ccr_response <> 'named' or coalesce(btrim(crm_reference) ~ '^[A-Za-z0-9_-]{6,80}$', false))
  ))
);

create unique index if not exists core_lp_tuesday_one_completion
  on public.core_lp_tuesday_contacts (loan_key, due_on) where complete;
create index if not exists core_lp_tuesday_contact_timeline
  on public.core_lp_tuesday_contacts (loan_key, due_on, recorded_at);

alter table public.core_lp_tuesday_assignments enable row level security;
alter table public.core_lp_tuesday_contacts enable row level security;
revoke all on public.core_lp_tuesday_assignments, public.core_lp_tuesday_contacts
  from public, anon, authenticated;
grant select on public.core_lp_tuesday_assignments, public.core_lp_tuesday_contacts to authenticated;
grant insert (loan_key, due_on, owner, source_reference, agent_exempt)
  on public.core_lp_tuesday_assignments to authenticated;
grant insert (request_id, loan_key, due_on, complete, borrower_outcome, agent_outcome,
  ccr_asked, ccr_response, crm_reference, notes, next_steps)
  on public.core_lp_tuesday_contacts to authenticated;

drop policy if exists core_lp_tuesday_assignment_read on public.core_lp_tuesday_assignments;
create policy core_lp_tuesday_assignment_read
  on public.core_lp_tuesday_assignments for select to authenticated
  using (exists (
    select 1 from public.core_lp_members m where m.user_id = (select auth.uid())
      and (m.member_name = 'Mack' or m.member_name = owner)
  ));

drop policy if exists core_lp_tuesday_assignment_import on public.core_lp_tuesday_assignments;
create policy core_lp_tuesday_assignment_import
  on public.core_lp_tuesday_assignments for insert to authenticated
  with check (exists (
    select 1 from public.core_lp_members m where m.user_id = (select auth.uid()) and m.member_name = 'Mack'
  ));

drop policy if exists core_lp_tuesday_contact_read on public.core_lp_tuesday_contacts;
create policy core_lp_tuesday_contact_read
  on public.core_lp_tuesday_contacts for select to authenticated
  using (exists (
    select 1 from public.core_lp_tuesday_assignments a
    where a.loan_key = core_lp_tuesday_contacts.loan_key and a.due_on = core_lp_tuesday_contacts.due_on
  ));

drop policy if exists core_lp_tuesday_contact_record on public.core_lp_tuesday_contacts;
create policy core_lp_tuesday_contact_record
  on public.core_lp_tuesday_contacts for insert to authenticated
  with check (exists (
    select 1 from public.core_lp_tuesday_assignments a
    join public.core_lp_members m on m.member_name = a.owner and m.user_id = (select auth.uid())
    where a.loan_key = core_lp_tuesday_contacts.loan_key and a.due_on = core_lp_tuesday_contacts.due_on
      and (core_lp_tuesday_contacts.agent_outcome <> 'exempt' or a.agent_exempt)
      and a.due_on <= (statement_timestamp() at time zone 'America/New_York')::date
  ));

create or replace view public.core_lp_tuesday_worklist
with (security_invoker = true) as
select a.loan_key, a.due_on, a.owner, a.agent_exempt, c.completed_at,
       case when c.completed_at is not null then 'complete'
         when a.due_on < (statement_timestamp() at time zone 'America/New_York')::date then 'overdue'
         when a.due_on = (statement_timestamp() at time zone 'America/New_York')::date then 'due'
         else 'upcoming' end as status
from public.core_lp_tuesday_assignments a
left join lateral (
  select recorded_at as completed_at from public.core_lp_tuesday_contacts
  where loan_key = a.loan_key and due_on = a.due_on and complete
) c on true;
revoke all on public.core_lp_tuesday_worklist from public, anon, authenticated;
grant select on public.core_lp_tuesday_worklist to authenticated;

commit;
