begin;

create or replace function public.core_ensure_postclose_tasks(p_loan text) returns integer
language plpgsql security definer set search_path = public as $$
declare l public.core_loans; n integer := 0; d integer; due date; added integer; launch date := public.core_launch_date();
begin
  select * into l from public.core_loans where loan_number = p_loan;
  if l.loan_number is null or not l.funding_verified or l.closed_date is null then return 0; end if;
  perform set_config('core.system_write', 'on', true);
  foreach d in array array[30,60,90] loop
    due := l.closed_date + d;
    if l.closed_date < launch and (d = 90 or due < launch) then continue; end if;
    insert into public.core_tasks(task_key, task_type, loan_number, owner_lp, due_date, status, review_note)
    values ('PC' || d || ':' || l.loan_number, 'pc' || d, l.loan_number, l.lp_owner, due,
            'open', null)
    on conflict (task_key) do nothing;
    get diagnostics added = row_count; n := n + added;
    -- actual closing date is authoritative: reschedule only work that has not happened
    update public.core_tasks set due_date = due
     where task_key = 'PC' || d || ':' || l.loan_number and due_date <> due and status in ('open','attempted','needs_review');
  end loop;
  perform set_config('core.system_write', 'off', true);
  return n;
end $$;

-- The first import generated 90-day tasks for pre-launch closings.
-- Retain records and audit history while removing untouched tasks from active work.
select set_config('core.actor', 'Post-closing rollout', true);

update public.core_tasks t
set status = 'cancelled',
    review_note = '90-day calls start with loans closed on or after the program launch date'
from public.core_loans l
where t.loan_number = l.loan_number
  and t.task_type = 'pc90'
  and t.status = 'open'
  and l.closed_date < public.core_launch_date()
  and t.borrower_outcome is null
  and t.borrower_notes is null
  and not exists (
    select 1 from public.core_task_events e
    where e.task_id = t.id and e.event_type <> 'assignment'
  );

commit;
