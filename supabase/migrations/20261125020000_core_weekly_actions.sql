create table public.core_weekly_actions (
  id uuid primary key,
  area text not null check (area in ('Production','Relationships','Leadership')),
  owner_name text not null check (char_length(btrim(owner_name)) between 1 and 80),
  next_action text not null check (char_length(btrim(next_action)) between 1 and 500),
  due_date date not null,
  success_measure text not null check (char_length(btrim(success_measure)) between 1 and 500),
  result text check (char_length(btrim(result)) between 1 and 500),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((completed_at is null) = (result is null))
);

alter table public.core_weekly_actions enable row level security;
revoke all on public.core_weekly_actions from public, anon, authenticated;

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

revoke all on function public.core_api_weekly_actions(text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.core_api_weekly_actions(text,text,text,jsonb) to anon, authenticated;
