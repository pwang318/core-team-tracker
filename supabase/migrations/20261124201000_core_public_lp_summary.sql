begin;

-- Public dashboard data is deliberately limited to the LP roster and counts.
create or replace function public.core_api_lp_public_summary()
returns table(lp text, tuesday_open bigint, pc30_due bigint, pc60_due bigint, pc90_due bigint)
language sql stable security definer set search_path = ''
as $$
  select roster.lp,
    count(*) filter (where tasks.task_type = 'tuesday'
      and (tasks.plan_week = public.core_tuesday_of(public.core_today()) or tasks.due_date <= public.core_today())),
    count(*) filter (where tasks.task_type = 'pc30' and tasks.due_date <= public.core_today()),
    count(*) filter (where tasks.task_type = 'pc60' and tasks.due_date <= public.core_today()),
    count(*) filter (where tasks.task_type = 'pc90' and tasks.due_date <= public.core_today())
  from (values ('Gavin'), ('Karen'), ('Osgood'), ('Jordan'), ('Said'), ('Isaak')) as roster(lp)
  left join public.core_tasks tasks
    on coalesce(tasks.coverage_lp, tasks.owner_lp) = roster.lp
    and tasks.status in ('open', 'attempted')
  group by roster.lp
  order by roster.lp;
$$;
revoke all on function public.core_api_lp_public_summary() from public;
grant execute on function public.core_api_lp_public_summary() to anon, authenticated;

commit;
