-- Run against a disposable database after applying the CORE LP migrations.
begin;
do $$
begin
  begin
    insert into public.core_lp_funded_loans (loan_key, closed_on, source_reference)
      values ('10000000000000000000', '2026-11-23', 'test');
    raise exception 'Import unexpectedly succeeded without a launch date';
  exception when raise_exception then
    if sqlerrm <> 'Set the post-closing launch date before importing funded loans.' then
      raise;
    end if;
  end;
end;
$$;
insert into core_lp_private.post_closing_rollout (launch_on) values ('2026-11-24');
insert into public.core_lp_funded_loans (loan_key, closed_on, source_reference)
values ('10000000000000000001', '2026-09-24', 'test'),
       ('10000000000000000002', '2026-09-25', 'test'),
       ('10000000000000000003', '2026-10-25', 'test'),
       ('10000000000000000004', '2026-11-24', 'test'),
       ('10000000000000000005', '2026-11-25', 'test');
do $$
begin
  if (select jsonb_object_agg(loan_key, milestones) from (
      select loan_key, array_agg(milestone order by milestone) as milestones
      from public.core_lp_post_closing_tasks group by loan_key
    ) t) is distinct from
    '{"10000000000000000002":[60],"10000000000000000003":[30,60],"10000000000000000004":[30,60,90],"10000000000000000005":[30,60,90]}'::jsonb then
    raise exception 'Unexpected launch milestone schedule';
  end if;
end;
$$;
rollback;
