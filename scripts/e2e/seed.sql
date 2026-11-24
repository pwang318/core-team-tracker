-- E2E database: Supabase-like roles, the CORE migration, stand-ins for the
-- shared tables the 2027 dashboard reads, and fictional users. Synthetic only.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema public to anon, authenticated;

create table if not exists public.agent_profiles(agent_name text primary key, closes_past_year int, latest_lead_date date, latest_close_date date,
  relationship_status text default 'active', powerbi_last_seen_at timestamptz default now(), powerbi_level text);
create table if not exists public.velocify_leads(id serial primary key, lead_key text, date_added date, created_at timestamptz default now(), lp_user text, status text);
create table if not exists public.lp_scorecards(person text not null, week_key text not null, data jsonb, unique(person, week_key));
grant select, insert, update on public.lp_scorecards to anon;
insert into public.lp_scorecards(person, week_key, data) values
 ('Gavin', to_char(date_trunc('week', (now() at time zone 'America/New_York'))::date, 'YYYY-MM-DD'), '{"past_client_talks_Mon":4,"apps_1003_Mon":2,"pre_approvals_Tue":1}'),
 ('Gavin', to_char(date_trunc('week', (now() at time zone 'America/New_York'))::date - 7, 'YYYY-MM-DD'), '{"referred_leads_Mon":10,"apps_1003_Tue":8,"pre_approvals_Wed":3,"contracts_Thu":2}')
on conflict do nothing;
create table if not exists public.powerbi_import_log(id serial primary key, imported_at timestamptz default now(), source_app text, rows_processed int, errors jsonb);
grant select on public.agent_profiles, public.velocify_leads, public.powerbi_import_log to anon, authenticated;
insert into public.agent_profiles(agent_name, closes_past_year, latest_lead_date, latest_close_date) values
 ('FICTIONAL CHANNEL ONE', 12, current_date - 10, current_date - 20), ('FICTIONAL A ONE', 5, current_date - 40, null),
 ('FICTIONAL A TWO', 4, current_date - 200, current_date - 150), ('FICTIONAL B ONE', 2, current_date - 5, null), ('FICTIONAL C ONE', 1, null, null)
on conflict do nothing;
insert into public.powerbi_import_log(source_app, rows_processed) values ('core-team-tracker', 5);
insert into public.velocify_leads(lead_key, date_added) values ('L1', current_date - 2), ('L2', current_date - 3);

\i supabase/migrations/20261124_core_execution.sql
\i supabase/migrations/20261124194049_core_funded_lp2_rollout.sql

select public.core_set_access_key('team',    'e2e-team-key-0123456789abcdef', 'LPs');
select public.core_set_access_key('manager', 'e2e-mgr-key-0123456789abcdef0', 'Mack');
select public.core_set_access_key('leader',  'e2e-lead-key-0123456789abcdef', 'Daniel');
-- Launch 20 days ago so overdue carry-forward can be exercised on post-closing calls.
update public.core_settings set value = to_jsonb(((now() at time zone 'America/New_York')::date - 20)::text) where key = 'launch_date';
