alter table public.core_weekly_actions
add column edit_history jsonb not null default '[]'::jsonb;

create or replace function public.core_api_weekly_actions(p_key text, p_actor text, p_action text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tier text;
  action_row public.core_weekly_actions;
begin
  tier := public.core_auth(p_key, p_actor);
  if tier not in ('manager','leader','admin') then
    raise exception 'CORE_FORBIDDEN: Leadership access is required for weekly actions';
  end if;

  if p_action = 'list' then
    return coalesce((
      select pg_catalog.jsonb_agg(a order by a.completed_at is not null, a.completed_at desc, a.due_date, a.id)
      from public.core_weekly_actions a
      where a.completed_at is null or a.completed_at >= now() - interval '30 days'
    ), '[]'::jsonb);
  end if;

  if not public.core_is_manager() then
    raise exception 'CORE_FORBIDDEN: Manager access is required to update weekly actions';
  end if;

  if p_action = 'create' then
    insert into public.core_weekly_actions (id, area, owner_name, next_action, due_date, success_measure)
    values ((p->>'id')::uuid, p->>'area', btrim(p->>'owner_name'), btrim(p->>'next_action'),
      (p->>'due_date')::date, btrim(p->>'success_measure'))
    on conflict (id) do nothing;
    select * into action_row from public.core_weekly_actions where id = (p->>'id')::uuid;
  elsif p_action = 'edit' then
    update public.core_weekly_actions a
    set owner_name = btrim(p->>'owner_name'), due_date = (p->>'due_date')::date,
        edit_history = a.edit_history || jsonb_build_array(jsonb_build_object(
          'at', now(), 'actor', current_setting('core.actor',true),
          'previous_owner', a.owner_name, 'previous_due_date', a.due_date,
          'owner', btrim(p->>'owner_name'), 'due_date', (p->>'due_date')::date))
    where a.id = (p->>'id')::uuid and a.completed_at is null
      and jsonb_array_length(a.edit_history) = (p->>'version')::integer
    returning * into action_row;
    if not found then raise exception 'CORE_CONFLICT: Commitment changed or closed. Reload before editing'; end if;
  elsif p_action = 'complete' then
    update public.core_weekly_actions set result = btrim(p->>'result'), completed_at = now()
    where id = (p->>'id')::uuid and completed_at is null returning * into action_row;
    if not found then
      select * into action_row from public.core_weekly_actions where id = (p->>'id')::uuid;
    end if;
  else
    raise exception 'CORE_VALIDATION: Unknown weekly action';
  end if;
  if action_row.id is null then raise exception 'CORE_VALIDATION: Weekly action not found'; end if;
  return pg_catalog.to_jsonb(action_row);
end
$$;


create table public.core_forecast_reviews (
  loan_number text primary key references public.core_loans(loan_number) on update cascade on delete cascade,
  estimated_date date not null,
  status text not null check (status in ('on_track','at_risk','confirm_date')),
  reviewed_at timestamptz not null default now()
);
alter table public.core_forecast_reviews enable row level security;
revoke all on public.core_forecast_reviews from public, anon, authenticated;

create function public.core_api_forecast_reviews(p_key text, p_actor text, p_action text, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  tier text;
  closing_date date;
  review public.core_forecast_reviews;
begin
  tier := public.core_auth(p_key, p_actor);
  if tier not in ('manager','admin','leader') then
    raise exception 'CORE_FORBIDDEN: Leadership access is required for closing reviews';
  end if;
  if p_action = 'list' then
    return coalesce((
      select jsonb_agg(r) from public.core_forecast_reviews r
      join public.core_loans l using (loan_number)
      where l.pipeline_status = 'active' and not l.funding_verified
        and l.est_closing_date = r.estimated_date
    ), '[]'::jsonb);
  end if;
  if p_action <> 'save' or not public.core_is_manager() then
    raise exception 'CORE_FORBIDDEN: Manager access is required to update closing reviews';
  end if;
  select est_closing_date into closing_date from public.core_loans
  where loan_number = p->>'loan_number' and pipeline_status = 'active' and not funding_verified
  for share;
  if closing_date is null or closing_date is distinct from (p->>'estimated_date')::date then
    raise exception 'CORE_CONFLICT: Closing date changed. Refresh and review the current date';
  end if;
  insert into public.core_forecast_reviews (loan_number, estimated_date, status)
  values (p->>'loan_number', closing_date, p->>'status')
  on conflict (loan_number) do update set estimated_date = excluded.estimated_date,
    status = excluded.status, reviewed_at = now()
  returning * into review;
  return to_jsonb(review);
end
$$;
revoke all on function public.core_api_forecast_reviews(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.core_api_forecast_reviews(text,text,text,jsonb) to anon, authenticated;
