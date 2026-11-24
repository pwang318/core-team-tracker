-- Run against a disposable database after applying the CORE LP migrations.
begin;
insert into core_lp_private.post_closing_rollout (launch_on) values ('2024-01-01');
insert into auth.users (id) values
  ('20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002');
insert into public.core_lp_members values
  ('20000000-0000-4000-8000-000000000001', 'Mack'),
  ('20000000-0000-4000-8000-000000000002', 'Gavin');
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
do $$
begin
  if public.core_lp_import_funded_loan('1234567890abcdefabcd', '2024-02-01', 'Gavin', 'report-1') <> 'imported'
     or public.core_lp_import_funded_loan('1234567890abcdefabcd', '2024-02-01', 'Gavin', 'report-2') <> 'unchanged'
     or public.core_lp_import_funded_loan('1234567890abcdefabcd', '2024-02-02', 'Karen', 'report-2') <> 'needs_review'
     or public.core_lp_import_funded_loan('1234567890abcdefabcd', '2024-02-02', 'Karen', 'report-2') <> 'needs_review' then
    raise exception 'Unexpected import result';
  end if;
  if (select count(*) from public.core_lp_post_closing_tasks) <> 3
     or (select min(original_due_on) from public.core_lp_post_closing_tasks) <> date '2024-03-02'
     or (select verified_owner from public.core_lp_funded_loans) <> 'Gavin'
     or (select count(*) from public.core_lp_funded_import_reviews) <> 1 then
    raise exception 'Import overwrote the original or duplicated work';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.core_lp_funded_import_reviews) then
    raise exception 'LP can see manager review rows';
  end if;
  begin
    perform public.core_lp_import_funded_loan('2234567890abcdefabcd', '2024-02-01', null, 'report-1');
    raise exception 'LP import unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end
$$;
rollback;
