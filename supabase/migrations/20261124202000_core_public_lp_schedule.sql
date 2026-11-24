begin;

create or replace function public.core_api_lp_public_schedule()
returns table(lp text, tuesday_open bigint, pc30_due bigint, pc60_due bigint, pc90_due bigint, schedule jsonb)
language sql stable security definer set search_path = ''
as $$
  with grouped as (
    select coalesce(t.coverage_lp, t.owner_lp) as lp, t.task_type, t.due_date, t.status, count(*) as total
    from public.core_tasks t
    where t.status in ('open', 'attempted')
      and (
        (t.task_type = 'tuesday' and (t.plan_week = public.core_tuesday_of(public.core_today()) or t.due_date <= public.core_today()))
        or (t.task_type in ('pc30', 'pc60', 'pc90') and t.due_date <= public.core_today() + 7)
      )
    group by 1, 2, 3, 4
  ), schedules as (
    select g.lp,
      jsonb_agg(jsonb_build_object('task_type', g.task_type, 'due_date', g.due_date, 'status', g.status, 'total', g.total)
                order by g.due_date, g.status) as schedule
    from grouped g
    group by g.lp
  )
  select s.lp, s.tuesday_open, s.pc30_due, s.pc60_due, s.pc90_due, coalesce(d.schedule, '[]'::jsonb)
  from public.core_api_lp_public_summary() s
  left join schedules d on d.lp = s.lp;
$$;

revoke all on function public.core_api_lp_public_schedule() from public;
grant execute on function public.core_api_lp_public_schedule() to anon, authenticated;

commit;
