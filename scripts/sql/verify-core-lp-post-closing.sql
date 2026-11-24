-- Run against a disposable database after applying the CORE LP migration.
begin;
insert into core_lp_private.post_closing_rollout (launch_on) values ('2024-01-01');
insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
insert into public.core_lp_members values
  ('10000000-0000-4000-8000-000000000001', 'Mack'),
  ('10000000-0000-4000-8000-000000000002', 'Gavin'),
  ('10000000-0000-4000-8000-000000000003', 'Karen');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.core_lp_funded_loans (loan_key, closed_on, verified_owner, source_reference)
values ('1234567890abcdefabcd', '2024-02-01', 'Gavin', 'synthetic-encompass'),
       ('2234567890abcdefabcd', '2024-02-01', null, 'synthetic-encompass');
insert into public.core_lp_funded_loans (loan_key, closed_on, verified_owner, source_reference)
values ('1234567890abcdefabcd', '2024-02-01', 'Gavin', 'synthetic-encompass')
on conflict (loan_key) do nothing;

do $$
begin
  if (select count(*) from public.core_lp_post_closing_tasks) <> 6 then
    raise exception 'Expected exactly three tasks per loan after replay';
  end if;
  if (select array_agg(original_due_on order by milestone)
      from public.core_lp_post_closing_tasks where loan_key = '1234567890abcdefabcd')
      is distinct from array[date '2024-03-02', date '2024-04-01', date '2024-05-01'] then
    raise exception 'Unexpected calendar-day schedule';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.core_lp_post_closing_tasks) <> 3 then
    raise exception 'Gavin should see only his assigned milestones';
  end if;
  begin
    insert into public.core_lp_funded_loans (loan_key, closed_on, source_reference)
    values ('3234567890abcdefabcd', '2024-02-01', 'synthetic-encompass');
    raise exception 'LP insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.core_lp_post_closing_tasks) then
    raise exception 'Another LP can see Gavin or unassigned tasks';
  end if;
end;
$$;

set local role anon;
do $$
begin
  if has_table_privilege(current_user, 'public.core_lp_post_closing_tasks', 'select') then
    raise exception 'Anonymous table access unexpectedly granted';
  end if;
end;
$$;
rollback;
