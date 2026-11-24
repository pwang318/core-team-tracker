-- Run against a disposable database after applying the CORE LP migrations.
begin;
insert into core_lp_private.post_closing_rollout (launch_on) values ('2024-01-01');
insert into auth.users values ('40000000-0000-4000-8000-000000000001'), ('40000000-0000-4000-8000-000000000002');
insert into public.core_lp_members values
  ('40000000-0000-4000-8000-000000000001', 'Mack'),
  ('40000000-0000-4000-8000-000000000002', 'Gavin');
insert into public.core_lp_funded_loans (loan_key, closed_on, source_reference)
  values ('40000000000000000001', '2024-01-01', 'test');
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);
do $$
begin
  if public.core_lp_assign_funded_owner('40000000000000000001', 0, 'Gavin', 'Verified Encompass record') <> 1
     or public.core_lp_assign_funded_owner('40000000000000000001', 1, 'Karen', 'Verified reassignment') <> 2
     or public.core_lp_assign_funded_owner('40000000000000000001', 2, 'Karen', 'Repeated save') <> 2 then
    raise exception 'Unexpected assignment revision';
  end if;
  begin
    perform public.core_lp_assign_funded_owner('40000000000000000001', 1, 'Gavin', 'Stale edit');
    raise exception 'Stale assignment succeeded';
  exception when serialization_failure then null;
  end;
  if (select verified_owner from public.core_lp_funded_loans) is distinct from 'Karen'
      or (select count(*) from public.core_lp_funded_assignment_history) <> 2
      or (select count(*) from public.core_lp_post_closing_tasks) <> 3 then
    raise exception 'Assignment history or original schedule was not preserved';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.core_lp_assign_funded_owner('40000000000000000001', 2, 'Gavin', 'Unauthorized');
    raise exception 'LP assignment succeeded';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.core_lp_funded_assignment_history) then
    raise exception 'LP can read assignment audit history';
  end if;
end;
$$;
rollback;
