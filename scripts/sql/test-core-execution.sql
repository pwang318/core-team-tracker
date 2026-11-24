-- Synthetic-data test suite for supabase/migrations/20261124_core_execution.sql
--   psql -v ON_ERROR_STOP=1 -f scripts/sql/test-core-execution.sql   (fresh database)
-- Every borrower, loan, key and name below is fictional.
\set QUIET on
\pset tuples_only on
\pset pager off
set client_min_messages = warning;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;
create table if not exists public.call_logs(id serial primary key, agent_name text, note text);
grant select, insert on public.call_logs to anon;
insert into public.call_logs(agent_name, note) values ('Existing Agent','pre-existing row');

\i supabase/migrations/20261124_core_execution.sql
\i supabase/migrations/20261124_core_execution.sql
\echo 'PASS migration applies twice (idempotent)'

select public.core_set_access_key('team',    'team-key-0123456789abcdefXYZ', 'LPs');
select public.core_set_access_key('manager', 'mgr-key-0123456789abcdefXYZ0', 'Mack');
select public.core_set_access_key('leader',  'lead-key-0123456789abcdefXYZ', 'Daniel');
\set T '''team-key-0123456789abcdefXYZ'''
\set M '''mgr-key-0123456789abcdefXYZ0'''
\set D '''lead-key-0123456789abcdefXYZ'''

create or replace function pg_temp.expect_error(p_sql text, p_like text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlerrm ilike '%' || p_like || '%' then return; end if;
    raise exception 'Expected error like "%" but got "%" for: %', p_like, sqlerrm, p_sql;
  end;
  raise exception 'Expected error like "%" but statement succeeded: %', p_like, p_sql;
end $$;
create or replace function pg_temp.eq(p_label text, p_actual anyelement, p_expected anyelement) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then raise exception 'FAIL %: expected %, got %', p_label, p_expected, p_actual; end if;
  raise notice 'PASS %', p_label;
end $$;
create or replace function pg_temp.tsave(p_key text, p_actor text, p_task_key text, p jsonb) returns jsonb language plpgsql as $$
declare t public.core_tasks;
begin
  select * into t from public.core_tasks where task_key = p_task_key;
  return public.core_api_save_task(p_key, p_actor, t.id, t.row_version, p);
end $$;
create or replace function pg_temp.tstatus(p_task_key text) returns text language sql as $$ select status from public.core_tasks where task_key = p_task_key $$;
set client_min_messages = notice;

-- 1. The public browser key cannot reach the tables; the API needs a valid team key
set role anon;
select pg_temp.expect_error('select * from public.core_tasks', 'permission denied');
select pg_temp.expect_error('select * from public.core_loans', 'permission denied');
select pg_temp.expect_error('select * from public.core_access_keys', 'permission denied');
select pg_temp.expect_error($q$select public.core_i_import_funded('[]','x')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.core_set_access_key('admin','attacker-key-123456789012345')$q$, 'permission denied');
select pg_temp.expect_error($q$select public.core_api_load('')$q$, 'Team access link required');
select pg_temp.expect_error($q$select public.core_api_load('wrong-key-0123456789abcdef')$q$, 'not valid');
select pg_temp.eq('team key loads through API as anon', (public.core_api_load(:T)->>'tier'), 'team');
select pg_temp.eq('anon still reads existing call_logs', (select count(*) from public.call_logs) >= 1, true);
reset role;
select pg_temp.eq('keys stored only as hashes', (select count(*) from public.core_access_keys where key_hash like '%key%'), 0::bigint);

-- 2. Only manager/admin may import
select pg_temp.expect_error($q$select public.core_import_pipeline('team-key-0123456789abcdefXYZ','Gavin','[]','x.xlsx','2026-11-24')$q$, 'CORE_FORBIDDEN');
select pg_temp.expect_error($q$select public.core_import_pipeline('lead-key-0123456789abcdefXYZ','Daniel','[]','x.xlsx','2026-11-24')$q$, 'CORE_FORBIDDEN');

-- 3. Pipeline import (baseline): verified LP2, unknown LP2, duplicate row, malformed row
select public.core_import_pipeline(:M, 'Mack', $j$[
 {"loan_number":"90000000001","borrower_name":"Test, Alpha","lp2":"Gavin Dill","est_closing_date":"2026-11-27","last_milestone":"Approval","loan_purpose":"Purchase","buyer_agent_name":"Agent One","buyer_agent_phone":"555-0101"},
 {"loan_number":"90000000002","borrower_name":"Test, Bravo","lp2":"Somebody Else","est_closing_date":"2026-12-15","last_milestone":"Submittal","loan_purpose":"Purchase","buyer_agent_name":"Agent Two"},
 {"loan_number":"90000000003","borrower_name":"Test, Charlie","lp2":"Karen De La Riva","est_closing_date":"2026-12-10","last_milestone":"Approval","loan_purpose":"No Cash-Out Refi","buyer_agent_name":"None None"},
 {"loan_number":"90000000003","borrower_name":"Test, Charlie","lp2":"Karen De La Riva","est_closing_date":"2026-12-10","last_milestone":"Approval","loan_purpose":"No Cash-Out Refi","buyer_agent_name":"None None"},
 {"loan_number":"","borrower_name":"No Number"}
]$j$::jsonb, 'Tuesday_Updates_test.xlsx', '2026-11-24') as r \gset imp1_
select pg_temp.eq('pipeline: tuesday computed', (:'imp1_r'::jsonb->>'tuesday'), '2026-11-24');
select pg_temp.eq('pipeline: duplicate row counted once', (:'imp1_r'::jsonb->>'duplicates')::int, 1);
select pg_temp.eq('pipeline: 3 unique loans accepted', (:'imp1_r'::jsonb->>'accepted')::int, 3);
select pg_temp.eq('pipeline: malformed row reported', (select count(*) from jsonb_array_elements(:'imp1_r'::jsonb->'exceptions') e where e->>'type'='missing_loan_number'), 1::bigint);
select pg_temp.eq('pipeline: Gavin verified owner', (select lp_owner from public.core_loans where loan_number='90000000001'), 'Gavin');
select pg_temp.eq('pipeline: unknown LP2 -> unassigned', (select ownership_status from public.core_loans where loan_number='90000000002'), 'unassigned');
select pg_temp.eq('pipeline: unassigned Tuesday task has no owner', (select owner_lp from public.core_tasks where task_key='TUE:90000000002:2026-11-24'), null::text);
select pg_temp.eq('pipeline: 3 Tuesday tasks', (select count(*) from public.core_tasks where task_type='tuesday'), 3::bigint);
select pg_temp.eq('pipeline: preclose for closing within 7 days', (select due_date from public.core_tasks where task_key='PRECLOSE:90000000001'), date '2026-11-26');
select pg_temp.eq('pipeline: no contract task on baseline import', (select count(*) from public.core_tasks where task_type='contract'), 0::bigint);
select public.core_import_pipeline(:M, 'Mack', $j$[
 {"loan_number":"90000000001","borrower_name":"Test, Alpha","lp2":"Gavin Dill","est_closing_date":"2026-11-27","last_milestone":"Approval","loan_purpose":"Purchase","buyer_agent_name":"Agent One"},
 {"loan_number":"90000000002","borrower_name":"Test, Bravo","lp2":"","est_closing_date":"2026-12-15","last_milestone":"Submittal","loan_purpose":"Purchase","buyer_agent_name":"Agent Two"},
 {"loan_number":"90000000003","borrower_name":"Test, Charlie","lp2":"Karen De La Riva","est_closing_date":"2026-12-10","last_milestone":"Approval","loan_purpose":"No Cash-Out Refi"}
]$j$::jsonb, 'Tuesday_Updates_test.xlsx', '2026-11-24') as r \gset imp2_
select pg_temp.eq('pipeline reimport creates 0 tasks', (:'imp2_r'::jsonb->>'tasks_created')::int, 0);
select pg_temp.eq('pipeline reimport keeps buyer agent phone', (select buyer_agent_phone from public.core_loans where loan_number='90000000001'), '555-0101');

-- 4. Tier protections
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"owner_lp":"Karen"}')$q$, 'CORE_FORBIDDEN');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"due_date":"2026-12-30"}')$q$, 'CORE_FORBIDDEN');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"status":"cancelled"}')$q$, 'CORE_FORBIDDEN');
select pg_temp.expect_error($q$select pg_temp.tsave('lead-key-0123456789abcdefXYZ','Daniel','TUE:90000000001:2026-11-24','{"borrower_notes":"leader edit"}')$q$, 'Read-only');
select pg_temp.expect_error($q$select public.core_api_bulk_tasks('team-key-0123456789abcdefXYZ','Gavin',array[gen_random_uuid()],'{"coverage_lp":"Karen"}')$q$, 'CORE_FORBIDDEN');

-- 5. Tuesday validation
select public.core_api_log_events(:T, 'Gavin', jsonb_build_array(jsonb_build_object('task_id',(select id from public.core_tasks where task_key='TUE:90000000001:2026-11-24'),'event_type','attempt','party','borrower','channel','voicemail')));
select public.core_api_log_events(:T, 'Gavin', jsonb_build_array(jsonb_build_object('task_id',(select id from public.core_tasks where task_key='TUE:90000000001:2026-11-24'),'event_type','attempt','party','borrower','channel','no_answer')));
select pg_temp.eq('multiple attempts preserved with actor', (select count(*) from public.core_task_events where actor='Gavin' and event_type='attempt'), 2::bigint);
select pg_temp.expect_error($q$select public.core_api_log_events('team-key-0123456789abcdefXYZ','Gavin',jsonb_build_array(jsonb_build_object('task_id',(select id from public.core_tasks limit 1),'event_type','attempt','occurred_at',(now()+interval '2 days')::text)))$q$, 'future');
select pg_temp.tsave(:T, 'Gavin', 'TUE:90000000001:2026-11-24', '{"status":"attempted","borrower_outcome":"voicemail"}');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"status":"completed"}')$q$, 'Borrower conversation required');
select pg_temp.tsave(:T, 'Gavin', 'TUE:90000000001:2026-11-24', jsonb_build_object('borrower_outcome','conversation','conversation_at',(now()-interval '10 minutes')::text,
  'borrower_notes','Reviewed approval conditions and appraisal timing with borrower','service_update','Approval received; appraisal back at value; on track for 11/27',
  'script_checks','{"update":true,"requirements_timeline":true,"asked_assistance":true,"offered_again":true}'::jsonb,'agent_outcome','spoke','agent_notes','Told agent appraisal at value, CTC expected Wed',
  'next_action','Confirm CTC with processor','next_action_date','2026-11-25'));
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"status":"completed"}')$q$, 'referral was requested');
select pg_temp.tsave(:T, 'Gavin', 'TUE:90000000001:2026-11-24', '{"script_checks":{"update":true,"requirements_timeline":true,"asked_assistance":true,"offered_again":true,"referral_ask":true},"referral_requested":true,"referral_response":"named_introduction","referral_name":"Pat Example","followthrough_note":"Called Pat, 1003 appointment Thursday 2pm"}');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"status":"completed"}')$q$, 'CRM');
select pg_temp.tsave(:T, 'Gavin', 'TUE:90000000001:2026-11-24', '{"referral_response":"own_financing","script_checks":{"update":true,"requirements_timeline":true,"asked_assistance":true,"offered_again":true}}');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"status":"completed"}')$q$, 'referral_ask');
select pg_temp.tsave(:T, 'Gavin', 'TUE:90000000001:2026-11-24', '{"script_checks":{"update":true,"requirements_timeline":true,"asked_assistance":true,"offered_again":true,"referral_ask":true},"referral_response":"named_introduction","crm_reference":"VEL-1001","concern_status":"unresolved","concern_notes":"Worried about cash to close increase"}');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"status":"completed"}')$q$, 'Unresolved client concern');
select pg_temp.tsave(:T, 'Gavin', 'TUE:90000000001:2026-11-24', '{"concern_status":"resolved","concern_notes":"Explained escrow change; borrower comfortable"}');
select (select row_version from public.core_tasks where task_key='TUE:90000000001:2026-11-24') as v \gset
select pg_temp.tsave(:T, 'Gavin', 'TUE:90000000001:2026-11-24', '{"status":"completed"}');
select pg_temp.eq('valid Tuesday update completes', pg_temp.tstatus('TUE:90000000001:2026-11-24'), 'completed');
select pg_temp.eq('completed_by is the selected name', (select completed_by from public.core_tasks where task_key='TUE:90000000001:2026-11-24'), 'Gavin');
select pg_temp.expect_error($q$select public.core_api_save_task('team-key-0123456789abcdefXYZ','Gavin',(select id from public.core_tasks where task_key='TUE:90000000001:2026-11-24'),$q$ || :v || $q$,'{"borrower_notes":"stale overwrite"}')$q$, 'changed on another device');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000001:2026-11-24','{"borrower_notes":"edit after completion"}')$q$, 'locked');
select pg_temp.eq('stale write did not overwrite', (select borrower_notes from public.core_tasks where task_key='TUE:90000000001:2026-11-24'), 'Reviewed approval conditions and appraisal timing with borrower');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','TUE:90000000003:2026-11-24','{"status":"completed","borrower_outcome":"conversation","conversation_at":"2026-01-01T10:00:00Z","borrower_notes":"Forged completion without the referral steps"}')$q$, 'CORE_VALIDATION');

-- Day sign-off
select pg_temp.expect_error($q$select public.core_api_signoff('team-key-0123456789abcdefXYZ','Gavin','Gavin','2020-01-01','tuesday')$q$, 'Only today');
select pg_temp.expect_error($q$select public.core_api_signoff('team-key-0123456789abcdefXYZ','Karen','Karen',public.core_today(),'tuesday')$q$, 'still outstanding');
select pg_temp.tsave(:T, 'Karen', 'TUE:90000000003:2026-11-24', jsonb_build_object('borrower_outcome','conversation','conversation_at',now()::text,'borrower_notes','Discussed appraisal waiver and closing date',
  'service_update','Appraisal waiver confirmed; docs out Friday','script_checks','{"update":true,"requirements_timeline":true,"asked_assistance":true,"referral_ask":true,"offered_again":true}'::jsonb,
  'referral_requested',true,'referral_response','asked_no_referral','agent_outcome','no_buyer_agent','next_action','Send closing appointment','next_action_date','2026-12-01','status','completed'));
select pg_temp.eq('refi without buyer agent completes', pg_temp.tstatus('TUE:90000000003:2026-11-24'), 'completed');
select pg_temp.eq('sign-off accepted once nothing outstanding', (public.core_api_signoff(:T, 'Karen', 'Karen', public.core_today(), 'tuesday')->>'lp'), 'Karen');
select pg_temp.eq('sign-off is idempotent', (public.core_api_signoff(:T, 'Karen', 'Karen', public.core_today(), 'tuesday')->>'lp'), 'Karen');

-- 6. Assignment, buyer agent rule, service recovery
select public.core_assign_loans(:M, 'Mack', array['90000000002'], 'Karen', 'Verified in Encompass');
select pg_temp.eq('manual assignment moves open Tuesday task', (select owner_lp from public.core_tasks where task_key='TUE:90000000002:2026-11-24'), 'Karen');
select pg_temp.eq('assignment event logged with actor', (select actor from public.core_task_events where event_type='assignment' limit 1), 'Mack');
select pg_temp.tsave(:T, 'Karen', 'TUE:90000000002:2026-11-24', jsonb_build_object('borrower_outcome','conversation','conversation_at',now()::text,'borrower_notes','Discussed appraisal scheduling and conditions',
  'service_update','Appraisal scheduled Monday; conditions submitted','script_checks','{"update":true,"requirements_timeline":true,"asked_assistance":true,"referral_ask":true,"offered_again":true}'::jsonb,
  'referral_requested',true,'referral_response','potential_opportunity','agent_outcome','no_buyer_agent','next_action','Follow up on appraisal','next_action_date','2026-12-01'));
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Karen','TUE:90000000002:2026-11-24','{"status":"completed"}')$q$, 'buyer agent is on file');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Karen','TUE:90000000002:2026-11-24','{"status":"exception","exception_kind":"service_recovery","exception_reason":"short"}')$q$, '15+');
select pg_temp.tsave(:T, 'Karen', 'TUE:90000000002:2026-11-24', '{"status":"exception","exception_kind":"service_recovery","concern_status":"unresolved","concern_notes":"Upset about rate lock extension fee","escalated":true,"exception_reason":"Escalated to Mack; callback scheduled after pricing review"}');
select pg_temp.eq('service recovery recorded as exception, not completed', pg_temp.tstatus('TUE:90000000002:2026-11-24'), 'exception');

-- 7. Next week: carry-forward + contract call; manual owner survives blank LP2
select public.core_import_pipeline(:M, 'Mack', $j$[
 {"loan_number":"90000000002","borrower_name":"Test, Bravo","lp2":"","est_closing_date":"2026-12-15","last_milestone":"Approval","loan_purpose":"Purchase","buyer_agent_name":"Agent Two"},
 {"loan_number":"90000000004","borrower_name":"Test, Delta","lp2":"Said Saleh","est_closing_date":"2027-01-08","last_milestone":"Submittal","loan_purpose":"Purchase","buyer_agent_name":"Agent Four"}
]$j$::jsonb, 'Tuesday_Updates_12-01.xlsx', '2026-12-02') as r \gset imp3_
select pg_temp.eq('Wednesday report maps to that week''s Tuesday', (:'imp3_r'::jsonb->>'tuesday'), '2026-12-01');
select pg_temp.eq('manual owner survives blank LP2 reimport', (select lp_owner from public.core_loans where loan_number='90000000002'), 'Karen');
select pg_temp.eq('new purchase after baseline gets contract call', (select count(*) from public.core_tasks where task_key='CONTRACT:90000000004'), 1::bigint);
select pg_temp.eq('prior week task kept (carry-forward)', (select count(*) from public.core_tasks where task_key like 'TUE:90000000002:%'), 2::bigint);

-- 8. Funded Units
select public.core_import_funded(:M, 'Mack', $j$[
 {"loan_number":"90000000001","borrower_name":"Test, Alpha","last_milestone":"Funding","closed_date":"2026-11-27"},
 {"loan_number":"91000000001","borrower_name":"Test, Echo","last_milestone":"Funding","closed_date":"2026-01-31","buyer_agent_name":"Big Realty"},
 {"loan_number":"91000000002","borrower_name":"Test, Foxtrot","last_milestone":"Funding","closed_date":"2026-12-31"},
 {"loan_number":"91000000003","borrower_name":"Test, Golf","last_milestone":"Completion","closed_date":"2026-06-09"},
 {"loan_number":"91000000004","borrower_name":"Test, Hotel","last_milestone":"Funding","closed_date":""},
 {"loan_number":"91000000005","borrower_name":"Test, India","last_milestone":"Funding","closed_date":"2026-10-31"},
 {"loan_number":"91000000005","borrower_name":"Test, India","last_milestone":"Funding","closed_date":"2026-10-31"}
]$j$::jsonb, 'funded_units_test.xlsx') as r \gset f1_
select pg_temp.eq('funded: duplicates counted', (:'f1_r'::jsonb->>'duplicates')::int, 1);
select pg_temp.eq('funded: 4 funded x 3 tasks', (:'f1_r'::jsonb->>'tasks_created')::int, 12);
select pg_temp.eq('PC30 Jan 31 -> Mar 2', (select due_date from public.core_tasks where task_key='PC30:91000000001'), date '2026-03-02');
select pg_temp.eq('pre-launch call is Needs Review', pg_temp.tstatus('PC30:91000000001'), 'needs_review');
select pg_temp.eq('PC30 Dec 31 -> Jan 30', (select due_date from public.core_tasks where task_key='PC30:91000000002'), date '2027-01-30');
select pg_temp.eq('PC60 Dec 31 -> Mar 1', (select due_date from public.core_tasks where task_key='PC60:91000000002'), date '2027-03-01');
select pg_temp.eq('PC90 Dec 31 -> Mar 31', (select due_date from public.core_tasks where task_key='PC90:91000000002'), date '2027-03-31');
select pg_temp.eq('PC30 Oct 31 -> Nov 30', (select due_date from public.core_tasks where task_key='PC30:91000000005'), date '2026-11-30');
select pg_temp.eq('Completion milestone -> funding exception', (select pipeline_status from public.core_loans where loan_number='91000000003'), 'funding_exception');
select pg_temp.eq('funding exception gets no tasks yet', (select count(*) from public.core_tasks where loan_number='91000000003'), 0::bigint);
select pg_temp.eq('missing closed date reported', (select count(*) from jsonb_array_elements(:'f1_r'::jsonb->'exceptions') e where e->>'type'='missing_closed_date'), 1::bigint);
select pg_temp.eq('verified owner flows to post-closing tasks', (select owner_lp from public.core_tasks where task_key='PC30:90000000001'), 'Gavin');
select pg_temp.eq('unmatched funded loan stays Unassigned', (select ownership_status from public.core_loans where loan_number='91000000001'), 'unassigned');
select pg_temp.eq('completed Tuesday history kept after funding', pg_temp.tstatus('TUE:90000000001:2026-11-24'), 'completed');
select public.core_import_funded(:M, 'Mack', '[{"loan_number":"91000000001","last_milestone":"Funding","closed_date":"2026-01-31"},{"loan_number":"91000000002","last_milestone":"Funding","closed_date":"2026-12-31"}]'::jsonb, 'funded_units_test.xlsx') as r \gset f2_
select pg_temp.eq('funded reimport creates 0 tasks', (:'f2_r'::jsonb->>'tasks_created')::int, 0);

-- Post-closing: PCR rules; completing one milestone never completes another
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','PC30:90000000001','{"status":"completed","borrower_outcome":"conversation","conversation_at":"2026-11-24T15:00:00Z","borrower_notes":"First payment set up, statement received fine","script_checks":{"settling":true,"first_statement":true,"payment_servicing":true,"questions_assistance":true,"offered_again":true},"referral_requested":true,"referral_response":"asked_no_referral","next_action":"60-day call","next_action_date":"2027-01-26"}')$q$, 'referral_ask');
select pg_temp.expect_error($q$select pg_temp.tsave('team-key-0123456789abcdefXYZ','Gavin','PC30:90000000001','{"status":"completed","borrower_outcome":"conversation","conversation_at":"2026-11-24T15:00:00Z","borrower_notes":"First payment set up, statement received fine","script_checks":{"settling":true,"first_statement":true,"payment_servicing":true,"questions_assistance":true,"referral_ask":true,"offered_again":true},"referral_requested":false,"referral_response":"asked_no_referral","next_action":"60-day call","next_action_date":"2027-01-26"}')$q$, 'referral was requested');
select pg_temp.tsave(:T, 'Gavin', 'PC30:90000000001', '{"status":"completed","borrower_outcome":"conversation","conversation_at":"2026-11-24T15:00:00Z","borrower_notes":"First payment set up, statement received fine","script_checks":{"settling":true,"first_statement":true,"payment_servicing":true,"questions_assistance":true,"referral_ask":true,"offered_again":true},"referral_requested":true,"referral_response":"asked_no_referral","next_action":"60-day call","next_action_date":"2027-01-26"}');
select pg_temp.eq('valid 30-day call completes', pg_temp.tstatus('PC30:90000000001'), 'completed');
select pg_temp.eq('60-day call untouched by 30-day completion', pg_temp.tstatus('PC60:90000000001'), 'open');
select public.core_import_funded(:M, 'Mack', '[{"loan_number":"90000000001","last_milestone":"Funding","closed_date":"2026-11-30"}]'::jsonb, 'funded_units_fix.xlsx') as r \gset f3_
select pg_temp.eq('closed date change reschedules open tasks', (select due_date from public.core_tasks where task_key='PC60:90000000001'), date '2027-01-29');
select pg_temp.eq('completed call keeps its original due date', (select due_date from public.core_tasks where task_key='PC30:90000000001'), date '2026-12-27');
select pg_temp.eq('rescheduled count reported', (:'f3_r'::jsonb->>'tasks_rescheduled')::int, 2);
select pg_temp.expect_error($q$select public.core_resolve_funding('mgr-key-0123456789abcdefXYZ0','Mack','91000000003', true, '')$q$, 'Document');
select public.core_resolve_funding(:M, 'Mack', '91000000003', true, 'Verified funded in Encompass funding screen');
select pg_temp.eq('reconciled exception gets 3 tasks', (select count(*) from public.core_tasks where loan_number='91000000003'), 3::bigint);

-- 9. Bulk: Needs Review closure touches only needs_review rows; coverage
select pg_temp.eq('bulk close touches only Needs Review', public.core_api_bulk_tasks(:M, 'Mack', array(select id from public.core_tasks where loan_number in ('91000000001','90000000001')), '{"status":"cancelled","review_note":"Reviewed: pre-launch history"}'), 3);
select pg_temp.eq('completed call not cancelled by bulk', pg_temp.tstatus('PC30:90000000001'), 'completed');
select public.core_api_coverage(:M, 'Mack', 'add', jsonb_build_object('from_lp','Gavin','to_lp','Karen','start_date',public.core_today(),'end_date',public.core_today()+2,'reason','PTO'));
select pg_temp.expect_error($q$select public.core_api_coverage('team-key-0123456789abcdefXYZ','Gavin','add','{}')$q$, 'CORE_FORBIDDEN');

-- 10. Corrections lifecycle
select public.core_api_correction(:M, 'Mack', 'create', jsonb_build_object('lp','Gavin','issue','Referral ask missing on Tuesday call','expected_behavior','Ask the 7-day referral question','due_date','2026-11-26'));
select pg_temp.expect_error($q$select public.core_api_correction('team-key-0123456789abcdefXYZ','Gavin','verify',jsonb_build_object('id',(select id from public.core_corrections limit 1)))$q$, 'CORE_FORBIDDEN');
select pg_temp.expect_error($q$select public.core_api_correction('team-key-0123456789abcdefXYZ','Gavin','resolve',jsonb_build_object('id',(select id from public.core_corrections limit 1),'resolution_note','ok'))$q$, 'Describe');
select public.core_api_correction(:T, 'Gavin', 'resolve', jsonb_build_object('id',(select id from public.core_corrections limit 1),'resolution_note','Re-called borrower and asked the referral question'));
select public.core_api_correction(:M, 'Mack', 'verify', jsonb_build_object('id',(select id from public.core_corrections limit 1),'verification_note','Checked next Tuesday'));
select pg_temp.eq('correction resolved by LP and verified by Mack', (select resolved_by || '/' || verified_by from public.core_corrections limit 1), 'Gavin/Mack');

-- 11. Load payload, audit, untouched production table
select pg_temp.eq('load excludes cancelled tasks', (select count(*) from jsonb_array_elements(public.core_api_load(:D)->'tasks') t where t->>'status'='cancelled'), 0::bigint);
select pg_temp.eq('leader can load', (public.core_api_load(:D)->>'tier'), 'leader');
select pg_temp.eq('audit history recorded', (select count(*) from public.core_audit_log where table_name='core_tasks' and action='UPDATE') > 5, true);
select pg_temp.eq('existing call_logs untouched', (select count(*) from public.call_logs), 1::bigint);
select pg_temp.eq('no RLS added to existing tables', (select relrowsecurity from pg_class where relname='call_logs'), false);

-- 12. Rollback removes only core_* objects
\i supabase/migrations/20261124_core_execution_rollback.sql
select pg_temp.eq('rollback removed core tables', (select count(*) from pg_tables where schemaname='public' and tablename like 'core\_%'), 0::bigint);
select pg_temp.eq('rollback removed core functions', (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'core\_%'), 0::bigint);
select pg_temp.eq('rollback kept existing table', (select count(*) from public.call_logs), 1::bigint);
\echo 'ALL SQL TESTS PASSED'
