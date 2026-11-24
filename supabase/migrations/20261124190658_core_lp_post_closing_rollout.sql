begin;

-- Set the actual launch date once, before importing funded loans.
create table if not exists core_lp_private.post_closing_rollout (
  singleton boolean primary key default true check (singleton),
  launch_on date not null check (isfinite(launch_on))
);
revoke all on core_lp_private.post_closing_rollout from public, anon, authenticated;

create or replace function core_lp_private.schedule_post_closing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  launch_date date;
begin
  select launch_on into launch_date
    from core_lp_private.post_closing_rollout where singleton;
  if launch_date is null then
    raise exception 'Set the post-closing launch date before importing funded loans.';
  end if;

  insert into public.core_lp_post_closing_tasks (loan_key, milestone, original_due_on)
    select new.loan_key, n, new.closed_on + n
    from (values (30), (60), (90)) as milestones(n)
    where new.closed_on >= launch_date
       or (n in (30, 60) and new.closed_on + n >= launch_date);
  return new;
end;
$$;

revoke all on function core_lp_private.schedule_post_closing() from public, anon, authenticated;

commit;
