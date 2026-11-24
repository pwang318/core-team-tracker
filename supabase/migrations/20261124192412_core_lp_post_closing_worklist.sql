begin;

create or replace view public.core_lp_post_closing_worklist
with (security_invoker = true) as
select task.loan_key,
       task.milestone,
       task.original_due_on,
       loan.verified_owner,
       stats.completed_at,
       stats.attempt_count,
       latest.evidence ->> 'outcome' as latest_outcome,
       latest.evidence ->> 'followUp' as follow_up_on
  from public.core_lp_post_closing_tasks task
  join public.core_lp_funded_loans loan using (loan_key)
  cross join lateral (
    select max(call.recorded_at) filter (where call.complete) as completed_at,
           count(*) filter (where not call.complete) as attempt_count
    from public.core_lp_post_closing_calls call
    where call.loan_key = task.loan_key and call.milestone = task.milestone
  ) stats
  left join lateral (
    select call.evidence
    from public.core_lp_post_closing_calls call
    where call.loan_key = task.loan_key and call.milestone = task.milestone
    order by call.recorded_at desc, call.request_id desc
    limit 1
  ) latest on true;

revoke all on public.core_lp_post_closing_worklist from public, anon, authenticated;
grant select on public.core_lp_post_closing_worklist to authenticated;

commit;
