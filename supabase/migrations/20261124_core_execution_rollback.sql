-- Rollback for 20261124_core_execution.
-- Removes ONLY objects whose names start with core_ (created by that migration).
-- Existing tracker, RM Tracker and Director tables are never referenced.
--
-- Step 1 (always first): back up the new data in the SQL editor:
--   create table backup_core_tasks_20261124 as table public.core_tasks;
--   create table backup_core_loans_20261124 as table public.core_loans;
--   create table backup_core_task_events_20261124 as table public.core_task_events;
--
-- Step 2 (soft rollback, recommended): revert the website to the backup tag
-- (see docs/core-execution/DEPLOY.md). The new tables can stay; nothing else reads them.
--
-- Step 3 (hard rollback, only if the tables must be removed):
begin;
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'core\_%' and p.prokind = 'f'
             and p.proname not in ('core_audit','core_tasks_guard','core_loans_touch','core_day_signoff_guard','core_corrections_guard','core_events_stamp')
  loop execute format('drop function if exists %s cascade', f.sig); end loop;
end $$;
drop table if exists public.core_audit_log, public.core_import_runs, public.core_corrections, public.core_coverage,
  public.core_day_signoffs, public.core_task_events, public.core_tasks, public.core_loans, public.core_access_keys,
  public.core_settings cascade;
drop function if exists public.core_audit(), public.core_tasks_guard(), public.core_loans_touch(),
  public.core_day_signoff_guard(), public.core_corrections_guard(), public.core_events_stamp();
commit;
