-- =====================================================================
-- CORE Team LP Tracker - Execution module (Tuesday Updates, 30/60/90,
-- contract and pre-closing calls, Mack's command center, 2027 plan).
--
-- Migration: 20261124_core_execution
-- Rollback:  20261124_core_execution_rollback.sql
--
-- ADDITIVE ONLY. Creates new core_* objects. It does not alter, drop or
-- change RLS on any existing table (call_logs, amanda_activities,
-- agent_profiles, velocify_leads, lp_scorecards, rm_*, etc.), so the
-- RM Tracker, the Director Command Center and the current LP tracker
-- keep working exactly as before.
--
-- Borrower data in these tables is NOT readable with the public anon key:
-- RLS is enabled with no policies and table privileges are revoked. The
-- browser reaches the data only through SECURITY DEFINER functions
-- (core_api_*) that require a valid private team-access key. Keys are stored
-- only as SHA-256 hashes. Selecting a name in the tracker is attribution,
-- not authentication; the key decides the access tier:
--   team  = the one shared team link everyone uses (view all, work calls)
--   manager = Mack's passcode, entered once per device, unlocks manager actions
--   admin = Director passcode (same rights as manager); leader = optional read-only key
-- Safe to re-run (idempotent).
-- =====================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Settings and roles
-- ---------------------------------------------------------------------
create table if not exists public.core_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into public.core_settings(key,value) values
  ('launch_date', '"2026-11-24"'::jsonb)
on conflict (key) do nothing;

create table if not exists public.core_access_keys (
  tier text primary key check (tier in ('team','manager','leader','admin')),
  key_hash text not null check (length(key_hash) = 64),
  label text,
  rotated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Loans (one row per Encompass loan number - the stable identifier)
-- ---------------------------------------------------------------------
create table if not exists public.core_loans (
  loan_number text primary key check (loan_number ~ '^[0-9A-Za-z-]{4,30}$'),
  borrower_name text,
  loan_purpose text,
  loan_type text,
  loan_program text,
  loan_amount numeric,
  est_closing_date date,
  closed_date date,
  cd_issued_date date,
  last_milestone text,
  milestone_date timestamptz,
  pipeline_status text not null default 'active'
    check (pipeline_status in ('active','funded','funding_exception','not_funded','inactive')),
  funding_verified boolean not null default false,
  funding_verified_by text,
  funding_verified_at timestamptz,
  funding_note text,
  lp_owner text check (lp_owner is null or lp_owner in ('Gavin','Karen','Osgood','Jordan','Said','Isaak')),
  ownership_status text not null default 'unassigned'
    check (ownership_status in ('verified','unassigned','conflict')),
  ownership_source text,           -- pipeline_lp2 | manual
  ownership_set_by text,
  ownership_set_at timestamptz,
  buyer_agent_name text,
  buyer_agent_phone text,
  buyer_agent_email text,
  referral_source_name text,
  loan_officer text,
  loan_processor text,
  property_address text,
  property_city text,
  property_state text,
  funding_source_category text check (funding_source_category is null or funding_source_category in
    ('realtor','rockford','current_client','past_client','returning_client','personal_friend','advertising','other')),
  in_pipeline_baseline boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_pipeline_at timestamptz,
  last_seen_funded_at timestamptz,
  last_import_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version integer not null default 1
);
create index if not exists core_loans_owner_idx on public.core_loans(lp_owner);
create index if not exists core_loans_closed_idx on public.core_loans(closed_date);
create index if not exists core_loans_status_idx on public.core_loans(pipeline_status);

-- ---------------------------------------------------------------------
-- Tasks: one row per required client conversation.
-- task_key makes every generated task idempotent:
--   TUE:<loan>:<tuesday>, PC30:<loan>, PC60:<loan>, PC90:<loan>,
--   CONTRACT:<loan>, PRECLOSE:<loan>
-- ---------------------------------------------------------------------
create table if not exists public.core_tasks (
  id uuid primary key default gen_random_uuid(),
  task_key text not null unique,
  task_type text not null check (task_type in ('tuesday','pc30','pc60','pc90','contract','preclose')),
  loan_number text not null references public.core_loans(loan_number) on update cascade,
  owner_lp text check (owner_lp is null or owner_lp in ('Gavin','Karen','Osgood','Jordan','Said','Isaak')),
  coverage_lp text check (coverage_lp is null or coverage_lp in ('Gavin','Karen','Osgood','Jordan','Said','Isaak')),
  coverage_until date,
  due_date date not null,
  plan_week date,
  status text not null default 'open'
    check (status in ('open','attempted','completed','exception','needs_review','cancelled')),
  borrower_outcome text check (borrower_outcome is null or borrower_outcome in
    ('conversation','voicemail','text_sent','email_sent','no_answer','wrong_number')),
  conversation_at timestamptz,
  borrower_notes text,
  service_update text,
  script_checks jsonb not null default '{}'::jsonb,
  referral_requested boolean not null default false,
  referral_response text check (referral_response is null or referral_response in
    ('asked_no_referral','potential_opportunity','named_introduction','own_financing')),
  referral_name text,
  referral_contact text,
  crm_reference text,
  followthrough_note text,
  referral_status text check (referral_status is null or referral_status in ('open','in_process','funded','lost')),
  referral_loan_number text,
  agent_outcome text check (agent_outcome is null or agent_outcome in
    ('spoke','update_sent','attempted','no_buyer_agent')),
  agent_notes text,
  concern_status text not null default 'none' check (concern_status in ('none','resolved','unresolved')),
  concern_notes text,
  escalated boolean not null default false,
  exception_kind text check (exception_kind is null or exception_kind in ('service_recovery','unreachable','other')),
  exception_reason text,
  exception_at timestamptz,
  next_action text,
  next_action_date date,
  completed_at timestamptz,
  completed_by text,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  row_version integer not null default 1
);
alter table public.core_tasks add column if not exists exception_at timestamptz;
create index if not exists core_tasks_owner_due_idx on public.core_tasks(owner_lp, due_date);
create index if not exists core_tasks_cover_idx on public.core_tasks(coverage_lp);
create index if not exists core_tasks_loan_idx on public.core_tasks(loan_number);
create index if not exists core_tasks_status_idx on public.core_tasks(status, due_date);

-- Append-only conversation and attempt history (actual timestamps preserved)
create table if not exists public.core_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.core_tasks(id),
  loan_number text,
  event_type text not null check (event_type in ('attempt','conversation','note','status','assignment','escalation','import')),
  party text check (party is null or party in ('borrower','buyer_agent','manager','system')),
  channel text,
  detail text,
  occurred_at timestamptz not null default now(),
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists core_task_events_task_idx on public.core_task_events(task_id, occurred_at);
create index if not exists core_task_events_loan_idx on public.core_task_events(loan_number);

-- Daily sign-off ("Complete Today's Tuesday Updates")
create table if not exists public.core_day_signoffs (
  id uuid primary key default gen_random_uuid(),
  lp text not null check (lp in ('Gavin','Karen','Osgood','Jordan','Said','Isaak')),
  work_date date not null,
  task_group text not null check (task_group in ('tuesday','post_closing')),
  task_count integer not null default 0,
  signed_off_by text,
  signed_off_at timestamptz not null default now(),
  unique (lp, work_date, task_group)
);

-- Out-of-office coverage
create table if not exists public.core_coverage (
  id uuid primary key default gen_random_uuid(),
  from_lp text not null check (from_lp in ('Gavin','Karen','Osgood','Jordan','Said','Isaak')),
  to_lp text not null check (to_lp in ('Gavin','Karen','Osgood','Jordan','Said','Isaak')),
  start_date date not null,
  end_date date not null,
  reason text,
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  check (end_date >= start_date and from_lp <> to_lp)
);

-- Corrections assigned by Mack
create table if not exists public.core_corrections (
  id uuid primary key default gen_random_uuid(),
  lp text not null check (lp in ('Gavin','Karen','Osgood','Jordan','Said','Isaak')),
  task_id uuid references public.core_tasks(id),
  loan_number text,
  issue text not null check (length(trim(issue)) >= 5),
  expected_behavior text,
  due_date date not null,
  status text not null default 'open' check (status in ('open','resolved','verified','reopened')),
  assigned_by text,
  assigned_at timestamptz not null default now(),
  resolution_note text,
  resolved_by text,
  resolved_at timestamptz,
  verified_by text,
  verified_at timestamptz,
  verification_note text,
  updated_at timestamptz not null default now()
);

-- Import history / data freshness
create table if not exists public.core_import_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('pipeline','funded_units')),
  file_name text,
  plan_date date,
  source_rows integer not null default 0,
  accepted_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  loans_inserted integer not null default 0,
  loans_updated integer not null default 0,
  tasks_created integer not null default 0,
  tasks_rescheduled integer not null default 0,
  exceptions jsonb not null default '[]'::jsonb,
  status text not null default 'ok' check (status in ('ok','partial','failed')),
  imported_by text,
  imported_at timestamptz not null default now()
);

-- Audit history
create table if not exists public.core_audit_log (
  id bigserial primary key,
  table_name text not null,
  row_key text,
  action text not null,
  actor text,
  at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);
create index if not exists core_audit_log_key_idx on public.core_audit_log(table_name, row_key, at desc);

-- ---------------------------------------------------------------------
-- Identity helpers (SECURITY DEFINER so policies can read the role table)
-- ---------------------------------------------------------------------
-- Request context is set by core_auth() inside each core_api_* call.
create or replace function public.core_me_email() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('core.actor', true), ''), nullif(current_setting('core.tier', true), ''), 'system')
$$;

create or replace function public.core_role() returns text
language sql stable as $$
  select case nullif(current_setting('core.tier', true), '')
           when 'team' then 'lp' when 'manager' then 'manager' when 'leader' then 'leader' when 'admin' then 'admin' end
$$;

create or replace function public.core_today() returns date
language sql stable as $$ select (now() at time zone 'America/New_York')::date $$;

create or replace function public.core_is_manager() returns boolean
language sql stable as $$ select coalesce(public.core_role() in ('manager','admin'), false) $$;

create or replace function public.core_auth(p_key text, p_actor text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_tier text;
begin
  if length(coalesce(p_key,'')) < 12 then raise exception 'CORE_FORBIDDEN: Team access link required'; end if;
  select tier into v_tier from public.core_access_keys where key_hash = encode(digest(p_key, 'sha256'), 'hex');
  if v_tier is null then raise exception 'CORE_FORBIDDEN: This team access link is not valid. Ask the Director for the current link'; end if;
  perform set_config('core.tier', v_tier, true);
  perform set_config('core.actor', left(coalesce(nullif(trim(p_actor), ''), initcap(v_tier)), 60), true);
  return v_tier;
end $$;

-- Run from the Supabase SQL editor only (not exposed to the browser).
create or replace function public.core_set_access_key(p_tier text, p_key text, p_label text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(coalesce(p_key,'')) < 12 then raise exception 'Use a random key of at least 12 characters (24+ recommended for the team link)'; end if;
  insert into public.core_access_keys(tier, key_hash, label) values (p_tier, encode(digest(p_key, 'sha256'), 'hex'), p_label)
  on conflict (tier) do update set key_hash = excluded.key_hash, label = excluded.label, rotated_at = now();
end $$;

create or replace function public.core_lp_short(p_name text) returns text
language plpgsql immutable as $$
declare n text := lower(trim(coalesce(p_name,'')));
begin
  if n = '' then return null; end if;
  -- "Last, First" -> "First Last"
  if position(',' in n) > 0 then n := trim(split_part(n, ',', 2)) || ' ' || trim(split_part(n, ',', 1)); end if;
  if n ~ '^gavin( |$)' or n ~ '(^| )dill$' then return 'Gavin'; end if;
  if n ~ '^karen( |$)' or n ~ 'de la riva$' then return 'Karen'; end if;
  if n ~ '^osgood( |$)' or n ~ '(^| )mcmahon$' then return 'Osgood'; end if;
  if n ~ '^jordan( |$)' and n !~ 'holibaugh' then return 'Jordan'; end if;
  if n ~ '^said( |$)' or n ~ '(^| )saleh$' then return 'Said'; end if;
  if n ~ '^isaak( |$)' then return 'Isaak'; end if;
  return null;
end $$;

-- ---------------------------------------------------------------------
-- Completion rules (mirrors core/core-logic.js validateTask)
-- ---------------------------------------------------------------------
create or replace function public.core_required_checks(p_type text) returns text[]
language sql immutable as $$
  select case p_type
    when 'tuesday'  then array['update','requirements_timeline','asked_assistance','referral_ask','offered_again']
    when 'pc30'     then array['settling','first_statement','payment_servicing','questions_assistance','referral_ask','offered_again']
    when 'pc60'     then array['settling','servicing_transfer','mortgage_questions','rate_drop_pledge','referral_ask','offered_again']
    when 'pc90'     then array['homeowner_experience','homeowner_needs','questions_concerns','future_assistance','referral_ask','offered_again']
    when 'contract' then array['promise_communication','promise_no_surprises','promise_on_time','request_text_realtor','request_no_secret','sales_anchor']
    when 'preclose' then array['closing_figures','promises_confirmed','concerns_addressed','future_referral_ask','postclose_expectations']
  end
$$;

create or replace function public.core_has_buyer_agent(p_name text) returns boolean
language sql immutable as $$
  select coalesce(nullif(regexp_replace(lower(trim(coalesce(p_name,''))), '^(none none|none|n/?a|na|jane doe|john doe|-)$', ''), ''), '') <> ''
$$;

create or replace function public.core_task_completion_errors(t public.core_tasks) returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  e text[] := '{}';
  k text;
  ba text;
begin
  if t.borrower_outcome is distinct from 'conversation' then
    e := array_append(e, 'Borrower conversation required (voicemail, text or no answer is an attempt, not a completed conversation)'::text);
  end if;
  if t.conversation_at is null then e := array_append(e, 'Conversation date and time required'::text); end if;
  if t.conversation_at > now() + interval '5 minutes' then e := array_append(e, 'Conversation time cannot be in the future'::text); end if;
  if length(trim(coalesce(t.borrower_notes,''))) < 20 then e := array_append(e, 'Borrower conversation notes required (20+ characters)'::text); end if;
  foreach k in array public.core_required_checks(t.task_type) loop
    if not (coalesce((t.script_checks ->> k)::boolean, false)
            or (k = 'rate_drop_pledge' and coalesce((t.script_checks ->> 'rate_drop_na')::boolean, false))) then
      e := array_append(e, 'Conversation step not confirmed: ' || k);
    end if;
  end loop;
  if not t.referral_requested then e := array_append(e, 'Explicit confirmation that the referral was requested is required'::text); end if;
  if t.task_type <> 'contract' and t.referral_response is null then e := array_append(e, 'Referral response required'::text); end if;
  if t.referral_response = 'named_introduction' then
    if length(trim(coalesce(t.referral_name,''))) < 2 then e := array_append(e, 'Named introduction requires the referral name'::text); end if;
    if length(trim(coalesce(t.crm_reference,''))) < 3 then
      e := array_append(e, 'Named introduction requires the CRM (Velocify) reference'::text);
    end if;
  end if;
  if t.concern_status = 'unresolved' then
    e := array_append(e, 'Unresolved client concern: record service recovery instead of completing'::text);
  end if;
  if t.concern_status = 'resolved' and length(trim(coalesce(t.concern_notes,''))) < 10 then
    e := array_append(e, 'Describe the concern and how it was resolved'::text);
  end if;
  if length(trim(coalesce(t.next_action,''))) < 3 then e := array_append(e, 'Next action required'::text); end if;
  if t.next_action_date is null then e := array_append(e, 'Follow-up date required'::text); end if;
  if t.task_type = 'tuesday' then
    if length(trim(coalesce(t.service_update,''))) < 15 then e := array_append(e, 'Meaningful service update required (15+ characters)'::text); end if;
    select buyer_agent_name into ba from public.core_loans where loan_number = t.loan_number;
    if t.agent_outcome is null or t.agent_outcome = 'attempted' then
      e := array_append(e, 'Buyer agent update required (an unanswered attempt does not complete it)'::text);
    elsif t.agent_outcome = 'no_buyer_agent' and public.core_has_buyer_agent(ba) then
      e := array_append(e, 'A buyer agent is on file for this loan; record the buyer agent contact'::text);
    elsif t.agent_outcome in ('spoke','update_sent') and length(trim(coalesce(t.agent_notes,''))) < 10 then
      e := array_append(e, 'Separate buyer agent notes required (10+ characters)'::text);
    end if;
  end if;
  return e;
end $$;

-- ---------------------------------------------------------------------
-- Guard trigger: field protection, validation, versioning
-- ---------------------------------------------------------------------
create or replace function public.core_tasks_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text := public.core_role();
  errs text[];
  is_system boolean := coalesce(current_setting('core.system_write', true), '') = 'on';
begin
  if tg_op = 'UPDATE' then
    if not is_system and r = 'lp' then
      if new.task_key is distinct from old.task_key or new.task_type is distinct from old.task_type
         or new.loan_number is distinct from old.loan_number or new.owner_lp is distinct from old.owner_lp
         or new.coverage_lp is distinct from old.coverage_lp or new.due_date is distinct from old.due_date
         or new.plan_week is distinct from old.plan_week or new.created_at is distinct from old.created_at then
        raise exception 'CORE_FORBIDDEN: Loan Partners cannot change ownership, coverage or due dates';
      end if;
      if new.status in ('needs_review','cancelled') and new.status is distinct from old.status then
        raise exception 'CORE_FORBIDDEN: Only the Production Manager can cancel or review tasks';
      end if;
      if old.status in ('completed','cancelled') then
        raise exception 'CORE_FORBIDDEN: Completed tasks are locked. Ask the Production Manager to reopen';
      end if;
    end if;
    -- Concurrency: clients PATCH with a row_version=eq.N filter; a stale write matches no row.
    new.row_version := old.row_version + 1;
    new.updated_at := now();
    new.updated_by := nullif(public.core_me_email(), '');
    if new.status = 'completed' and old.status is distinct from 'completed' then
      errs := public.core_task_completion_errors(new);
      if array_length(errs, 1) > 0 then
        raise exception 'CORE_VALIDATION: %', array_to_string(errs, ' | ');
      end if;
      new.completed_at := now();
      new.completed_by := nullif(public.core_me_email(), '');
    elsif new.status = 'completed' and old.status = 'completed' then
      new.completed_at := old.completed_at; new.completed_by := old.completed_by;
    elsif new.status is distinct from 'completed' and old.status = 'completed' then
      new.completed_at := null; new.completed_by := null;   -- manager reopened
    end if;
    if new.status = 'exception' and old.status is distinct from 'exception' then
      if length(trim(coalesce(new.exception_reason,''))) < 15 then
        raise exception 'CORE_VALIDATION: Exception requires the documented circumstance and recovery action (15+ characters)';
      end if;
      if new.next_action_date is null then
        raise exception 'CORE_VALIDATION: Exception requires a follow-up date';
      end if;
      if new.exception_kind = 'service_recovery' and length(trim(coalesce(new.concern_notes,''))) < 10 then
        raise exception 'CORE_VALIDATION: Service recovery requires the documented client concern';
      end if;
      new.exception_at := now();
    end if;
  else
    new.row_version := 1;
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    if new.status = 'completed' then
      raise exception 'CORE_VALIDATION: Tasks cannot be created as completed';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists core_tasks_guard_trg on public.core_tasks;
create trigger core_tasks_guard_trg before insert or update on public.core_tasks
for each row execute function public.core_tasks_guard();

create or replace function public.core_loans_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.row_version := old.row_version + 1; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists core_loans_touch_trg on public.core_loans;
create trigger core_loans_touch_trg before insert or update on public.core_loans
for each row execute function public.core_loans_touch();

-- Day sign-off cannot happen while work is outstanding
create or replace function public.core_day_signoff_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare remaining integer;
begin
  if coalesce(public.core_role(),'') not in ('lp','manager','admin') then
    raise exception 'CORE_FORBIDDEN: Read-only access';
  end if;
  select count(*) into remaining from public.core_tasks t
   where coalesce(t.coverage_lp, t.owner_lp) = new.lp
     and t.status in ('open','attempted')
     and t.due_date <= new.work_date
     and ((new.task_group = 'tuesday' and t.task_type = 'tuesday')
       or (new.task_group = 'post_closing' and t.task_type in ('pc30','pc60','pc90')));
  if remaining > 0 then
    raise exception 'CORE_VALIDATION: % assigned % still outstanding', remaining,
      case when remaining = 1 then 'update is' else 'updates are' end;
  end if;
  select count(*) into new.task_count from public.core_tasks t
   where coalesce(t.coverage_lp, t.owner_lp) = new.lp and t.due_date <= new.work_date
     and t.status in ('completed','exception')
     and ((new.task_group = 'tuesday' and t.task_type = 'tuesday')
       or (new.task_group = 'post_closing' and t.task_type in ('pc30','pc60','pc90')));
  new.signed_off_by := nullif(public.core_me_email(), '');
  new.signed_off_at := now();
  return new;
end $$;
drop trigger if exists core_day_signoff_guard_trg on public.core_day_signoffs;
create trigger core_day_signoff_guard_trg before insert on public.core_day_signoffs
for each row execute function public.core_day_signoff_guard();

-- Corrections: an LP may only record a resolution on their own correction
create or replace function public.core_corrections_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if public.core_role() = 'lp' then
    if new.lp is distinct from old.lp or new.issue is distinct from old.issue
       or new.due_date is distinct from old.due_date or new.expected_behavior is distinct from old.expected_behavior
       or new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at
       or new.status not in ('open','resolved') then
      raise exception 'CORE_FORBIDDEN: Loan Partners can only record a resolution';
    end if;
    if new.status = 'resolved' and old.status <> 'resolved' then
      if length(trim(coalesce(new.resolution_note,''))) < 10 then
        raise exception 'CORE_VALIDATION: Describe how the correction was resolved';
      end if;
      new.resolved_at := now(); new.resolved_by := public.core_me_email();
    end if;
  elsif new.status = 'verified' and old.status is distinct from 'verified' then
    new.verified_at := now(); new.verified_by := public.core_me_email();
  end if;
  return new;
end $$;
drop trigger if exists core_corrections_guard_trg on public.core_corrections;
create trigger core_corrections_guard_trg before update on public.core_corrections
for each row execute function public.core_corrections_guard();

-- Events: actor is always the signed-in user, never client-supplied
create or replace function public.core_events_stamp() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('core.system_write', true), '') <> 'on' then
    new.actor := nullif(public.core_me_email(), '');
  end if;
  if new.occurred_at > now() + interval '5 minutes' then
    raise exception 'CORE_VALIDATION: Activity time cannot be in the future';
  end if;
  return new;
end $$;
drop trigger if exists core_events_stamp_trg on public.core_task_events;
create trigger core_events_stamp_trg before insert on public.core_task_events
for each row execute function public.core_events_stamp();

-- Audit history
create or replace function public.core_audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text;
begin
  k := case tg_table_name
         when 'core_loans' then coalesce(to_jsonb(new) ->> 'loan_number', to_jsonb(old) ->> 'loan_number')
         when 'core_settings' then coalesce(to_jsonb(new) ->> 'key', to_jsonb(old) ->> 'key')
         else coalesce(to_jsonb(new) ->> 'id', to_jsonb(old) ->> 'id') end;
  insert into public.core_audit_log(table_name,row_key,action,actor,old_row,new_row)
  values (tg_table_name, k, tg_op, nullif(public.core_me_email(),''),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['core_tasks','core_loans','core_corrections','core_coverage','core_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit_trg', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function public.core_audit()', t || '_audit_trg', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Task generation helpers
-- ---------------------------------------------------------------------
create or replace function public.core_launch_date() returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::date from public.core_settings where key = 'launch_date'), date '2026-11-24')
$$;

create or replace function public.core_tuesday_of(p_date date) returns date
language sql immutable as $$ select (date_trunc('week', p_date)::date + 1) $$;  -- ISO week Monday + 1

create or replace function public.core_ensure_postclose_tasks(p_loan text) returns integer
language plpgsql security definer set search_path = public as $$
declare l public.core_loans; n integer := 0; d integer; due date; added integer;
begin
  select * into l from public.core_loans where loan_number = p_loan;
  if l.loan_number is null or not l.funding_verified or l.closed_date is null then return 0; end if;
  perform set_config('core.system_write', 'on', true);
  foreach d in array array[30,60,90] loop
    due := l.closed_date + d;
    insert into public.core_tasks(task_key, task_type, loan_number, owner_lp, due_date, status, review_note)
    values ('PC' || d || ':' || l.loan_number, 'pc' || d, l.loan_number, l.lp_owner, due,
            case when due < public.core_launch_date() then 'needs_review' else 'open' end,
            case when due < public.core_launch_date() then 'Due before launch; no documented call on file' end)
    on conflict (task_key) do nothing;
    get diagnostics added = row_count; n := n + added;
    -- actual closing date is authoritative: reschedule only work that has not happened
    update public.core_tasks set due_date = due
     where task_key = 'PC' || d || ':' || l.loan_number and due_date <> due and status in ('open','attempted','needs_review');
  end loop;
  perform set_config('core.system_write', 'off', true);
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Import: weekly Encompass pipeline / Tuesday Updates report
-- p_rows: [{loan_number, borrower_name, lp2, est_closing_date, last_milestone,
--           milestone_date, loan_purpose, loan_type, loan_program, loan_amount,
--           buyer_agent_name, buyer_agent_phone, buyer_agent_email,
--           referral_source_name, loan_processor, cd_issued_date}]
-- ---------------------------------------------------------------------
create or replace function public.core_i_import_pipeline(p_rows jsonb, p_file text, p_plan_date date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  run_id uuid := gen_random_uuid();
  tuesday date := public.core_tuesday_of(p_plan_date);
  baseline boolean := not exists (select 1 from public.core_import_runs where kind = 'pipeline' and status <> 'failed');
  r record; v_lp text; existing public.core_loans; ins integer := 0; upd integer := 0; created integer := 0; c integer;
  src integer := jsonb_array_length(coalesce(p_rows,'[]'::jsonb)); dups integer := 0; accepted integer := 0;
  ex jsonb := '[]'::jsonb; closing_milestone boolean;
begin
  if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can import reports'; end if;
  if p_plan_date is null then raise exception 'CORE_VALIDATION: Report date required'; end if;
  perform set_config('core.system_write', 'on', true);

  drop table if exists _rows;
  create temp table _rows on commit drop as
  select trim(x->>'loan_number') as loan_number, x, ord
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) with ordinality as e(x, ord);
  select count(*) into c from _rows where coalesce(loan_number,'') !~ '^[0-9A-Za-z-]{4,30}$';
  if c > 0 then ex := ex || jsonb_build_object('type','missing_loan_number','count',c); end if;
  delete from _rows where coalesce(loan_number,'') !~ '^[0-9A-Za-z-]{4,30}$';
  select count(*) - count(distinct loan_number) into dups from _rows;

  for r in
    select loan_number,
           (array_agg(x order by ord desc))[1] as x,
           count(distinct public.core_lp_short(x->>'lp2')) filter (where public.core_lp_short(x->>'lp2') is not null) as lp_variants,
           min(public.core_lp_short(x->>'lp2')) as lp_one
      from _rows group by loan_number order by min(ord)
  loop
    accepted := accepted + 1;
    v_lp := r.lp_one;
    select * into existing from public.core_loans where loan_number = r.loan_number;
    closing_milestone := coalesce(r.x->>'last_milestone','') ~* '^(funding|completion|purchased|shipping)';
    if existing.loan_number is null then
      insert into public.core_loans(loan_number, borrower_name, loan_purpose, loan_type, loan_program, loan_amount,
        est_closing_date, cd_issued_date, last_milestone, milestone_date, pipeline_status, lp_owner, ownership_status,
        ownership_source, ownership_set_at, buyer_agent_name, buyer_agent_phone, buyer_agent_email,
        referral_source_name, loan_processor, in_pipeline_baseline, last_seen_pipeline_at, last_import_id)
      values (r.loan_number, nullif(trim(r.x->>'borrower_name'),''), nullif(trim(r.x->>'loan_purpose'),''),
        nullif(trim(r.x->>'loan_type'),''), nullif(trim(r.x->>'loan_program'),''), nullif(r.x->>'loan_amount','')::numeric,
        nullif(r.x->>'est_closing_date','')::date, nullif(r.x->>'cd_issued_date','')::date,
        nullif(trim(r.x->>'last_milestone'),''), nullif(r.x->>'milestone_date','')::timestamptz,
        case when closing_milestone then 'inactive' else 'active' end,
        case when r.lp_variants > 1 then null else v_lp end,
        case when r.lp_variants > 1 then 'conflict' when v_lp is null then 'unassigned' else 'verified' end,
        case when v_lp is not null and r.lp_variants <= 1 then 'pipeline_lp2' end,
        case when v_lp is not null then now() end,
        nullif(trim(r.x->>'buyer_agent_name'),''), nullif(trim(r.x->>'buyer_agent_phone'),''), nullif(trim(r.x->>'buyer_agent_email'),''),
        nullif(trim(r.x->>'referral_source_name'),''), nullif(trim(r.x->>'loan_processor'),''), baseline, now(), run_id);
      ins := ins + 1;
      if r.lp_variants > 1 then ex := ex || jsonb_build_object('type','lp_conflict','loan_number',r.loan_number); end if;
      if v_lp is null and r.lp_variants <= 1 then ex := ex || jsonb_build_object('type','unassigned','loan_number',r.loan_number,'lp2',r.x->>'lp2'); end if;
    else
      update public.core_loans set
        borrower_name = coalesce(nullif(trim(r.x->>'borrower_name'),''), borrower_name),
        loan_purpose = coalesce(nullif(trim(r.x->>'loan_purpose'),''), loan_purpose),
        loan_type = coalesce(nullif(trim(r.x->>'loan_type'),''), loan_type),
        loan_program = coalesce(nullif(trim(r.x->>'loan_program'),''), loan_program),
        loan_amount = coalesce(nullif(r.x->>'loan_amount','')::numeric, loan_amount),
        est_closing_date = coalesce(nullif(r.x->>'est_closing_date','')::date, est_closing_date),
        cd_issued_date = coalesce(nullif(r.x->>'cd_issued_date','')::date, cd_issued_date),
        last_milestone = coalesce(nullif(trim(r.x->>'last_milestone'),''), last_milestone),
        milestone_date = coalesce(nullif(r.x->>'milestone_date','')::timestamptz, milestone_date),
        pipeline_status = case when pipeline_status in ('funded','not_funded','funding_exception') then pipeline_status
                               when closing_milestone then 'inactive' else 'active' end,
        -- Manual assignment by Mack always wins; otherwise the LP2 column is the verified source.
        lp_owner = case when ownership_source = 'manual' then lp_owner
                        when r.lp_variants > 1 then null
                        when v_lp is not null then v_lp else lp_owner end,
        ownership_status = case when ownership_source = 'manual' then ownership_status
                                when r.lp_variants > 1 then 'conflict'
                                when v_lp is not null then 'verified' else ownership_status end,
        ownership_source = case when ownership_source = 'manual' then ownership_source
                                when v_lp is not null and r.lp_variants <= 1 then 'pipeline_lp2' else ownership_source end,
        buyer_agent_name = coalesce(nullif(trim(r.x->>'buyer_agent_name'),''), buyer_agent_name),
        buyer_agent_phone = coalesce(nullif(trim(r.x->>'buyer_agent_phone'),''), buyer_agent_phone),
        buyer_agent_email = coalesce(nullif(trim(r.x->>'buyer_agent_email'),''), buyer_agent_email),
        referral_source_name = coalesce(nullif(trim(r.x->>'referral_source_name'),''), referral_source_name),
        loan_processor = coalesce(nullif(trim(r.x->>'loan_processor'),''), loan_processor),
        last_seen_pipeline_at = now(), last_import_id = run_id
      where loan_number = r.loan_number;
      upd := upd + 1;
    end if;

    select * into existing from public.core_loans where loan_number = r.loan_number;
    -- Open work follows a verified ownership change; completed history never moves.
    update public.core_tasks set owner_lp = existing.lp_owner
     where loan_number = r.loan_number and status in ('open','attempted','needs_review')
       and owner_lp is distinct from existing.lp_owner;

    if existing.pipeline_status = 'active' then
      insert into public.core_tasks(task_key, task_type, loan_number, owner_lp, due_date, plan_week)
      values ('TUE:' || r.loan_number || ':' || tuesday, 'tuesday', r.loan_number, existing.lp_owner, tuesday, tuesday)
      on conflict (task_key) do nothing;
      get diagnostics c = row_count; created := created + c;

      -- New contract conversation: loans that appear after the baseline import
      if not existing.in_pipeline_baseline and coalesce(existing.loan_purpose,'') ~* 'purchase' then
        insert into public.core_tasks(task_key, task_type, loan_number, owner_lp, due_date)
        values ('CONTRACT:' || r.loan_number, 'contract', r.loan_number, existing.lp_owner, p_plan_date)
        on conflict (task_key) do nothing;
        get diagnostics c = row_count; created := created + c;
      end if;

      -- Pre-closing review: closing within 7 days of the report date
      if existing.est_closing_date between p_plan_date and p_plan_date + 7 then
        insert into public.core_tasks(task_key, task_type, loan_number, owner_lp, due_date)
        values ('PRECLOSE:' || r.loan_number, 'preclose', r.loan_number, existing.lp_owner,
                greatest(p_plan_date, existing.est_closing_date - 1))
        on conflict (task_key) do nothing;
        get diagnostics c = row_count; created := created + c;
      end if;
      update public.core_tasks set due_date = greatest(p_plan_date, existing.est_closing_date - 1)
       where task_key = 'PRECLOSE:' || r.loan_number and status in ('open','attempted')
         and existing.est_closing_date is not null and due_date <> greatest(p_plan_date, existing.est_closing_date - 1);
    end if;
  end loop;

  insert into public.core_import_runs(id, kind, file_name, plan_date, source_rows, accepted_rows, duplicate_rows,
     loans_inserted, loans_updated, tasks_created, exceptions, status, imported_by)
  values (run_id, 'pipeline', p_file, p_plan_date, src, accepted, dups, ins, upd, created, ex,
          case when jsonb_array_length(ex) > 0 then 'partial' else 'ok' end, public.core_me_email());
  perform set_config('core.system_write', 'off', true);
  return jsonb_build_object('import_id', run_id, 'source_rows', src, 'accepted', accepted, 'duplicates', dups,
    'loans_inserted', ins, 'loans_updated', upd, 'tasks_created', created, 'tuesday', tuesday, 'exceptions', ex);
end $$;

-- ---------------------------------------------------------------------
-- Import: Encompass Funded Units report
-- p_rows: [{loan_number, borrower_name, last_milestone, closed_date, est_closing_date,
--           loan_type, buyer_agent_name, referral_source_name, loan_officer,
--           loan_processor, property_address, property_city, property_state}]
-- Funding milestone => verified funded => 30/60/90 tasks.
-- Any other milestone => funding_exception for Mack to reconcile (no tasks yet).
-- Ownership is NEVER inferred from this report.
-- ---------------------------------------------------------------------
create or replace function public.core_i_import_funded(p_rows jsonb, p_file text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  run_id uuid := gen_random_uuid(); r record; existing public.core_loans; c integer;
  ins integer := 0; upd integer := 0; created integer := 0; resched integer := 0; accepted integer := 0;
  src integer := jsonb_array_length(coalesce(p_rows,'[]'::jsonb)); dups integer := 0; ex jsonb := '[]'::jsonb;
  is_funding boolean; v_closed date;
begin
  if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can import reports'; end if;
  perform set_config('core.system_write', 'on', true);
  drop table if exists _f;
  create temp table _f on commit drop as
  select trim(x->>'loan_number') as loan_number, x, ord
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) with ordinality as e(x, ord);
  select count(*) into c from _f where coalesce(loan_number,'') !~ '^[0-9A-Za-z-]{4,30}$';
  if c > 0 then ex := ex || jsonb_build_object('type','missing_loan_number','count',c); end if;
  delete from _f where coalesce(loan_number,'') !~ '^[0-9A-Za-z-]{4,30}$';
  select count(*) - count(distinct loan_number) into dups from _f;

  for r in select loan_number, (array_agg(x order by ord desc))[1] as x from _f group by loan_number order by min(ord) loop
    v_closed := nullif(r.x->>'closed_date','')::date;
    if v_closed is null then
      ex := ex || jsonb_build_object('type','missing_closed_date','loan_number',r.loan_number);
      continue;
    end if;
    accepted := accepted + 1;
    is_funding := lower(trim(coalesce(r.x->>'last_milestone',''))) = 'funding';
    select * into existing from public.core_loans where loan_number = r.loan_number;
    if existing.loan_number is null then
      insert into public.core_loans(loan_number, borrower_name, last_milestone, closed_date, est_closing_date, loan_type,
        buyer_agent_name, referral_source_name, loan_officer, loan_processor, property_address, property_city, property_state,
        pipeline_status, funding_verified, funding_verified_at, funding_verified_by, funding_note,
        ownership_status, last_seen_funded_at, last_import_id)
      values (r.loan_number, nullif(trim(r.x->>'borrower_name'),''), nullif(trim(r.x->>'last_milestone'),''), v_closed,
        nullif(r.x->>'est_closing_date','')::date, nullif(trim(r.x->>'loan_type'),''),
        nullif(trim(r.x->>'buyer_agent_name'),''), nullif(trim(r.x->>'referral_source_name'),''),
        nullif(trim(r.x->>'loan_officer'),''), nullif(trim(r.x->>'loan_processor'),''),
        nullif(trim(r.x->>'property_address'),''), nullif(trim(r.x->>'property_city'),''), nullif(trim(r.x->>'property_state'),''),
        case when is_funding then 'funded' else 'funding_exception' end, is_funding,
        case when is_funding then now() end, case when is_funding then 'Funded Units report: Funding milestone' end,
        case when is_funding then null else 'Milestone in Funded Units report: ' || coalesce(r.x->>'last_milestone','blank') end,
        'unassigned', now(), run_id);
      ins := ins + 1;
    else
      update public.core_loans set
        borrower_name = coalesce(nullif(trim(r.x->>'borrower_name'),''), borrower_name),
        last_milestone = coalesce(nullif(trim(r.x->>'last_milestone'),''), last_milestone),
        closed_date = v_closed,
        loan_type = coalesce(nullif(trim(r.x->>'loan_type'),''), loan_type),
        referral_source_name = coalesce(nullif(trim(r.x->>'referral_source_name'),''), referral_source_name),
        loan_officer = coalesce(nullif(trim(r.x->>'loan_officer'),''), loan_officer),
        loan_processor = coalesce(nullif(trim(r.x->>'loan_processor'),''), loan_processor),
        property_address = coalesce(nullif(trim(r.x->>'property_address'),''), property_address),
        property_city = coalesce(nullif(trim(r.x->>'property_city'),''), property_city),
        property_state = coalesce(nullif(trim(r.x->>'property_state'),''), property_state),
        pipeline_status = case when is_funding then 'funded'
                               when funding_verified then pipeline_status
                               when pipeline_status = 'not_funded' then 'not_funded'
                               else 'funding_exception' end,
        funding_verified = funding_verified or is_funding,
        funding_verified_at = case when is_funding and not funding_verified then now() else funding_verified_at end,
        funding_verified_by = case when is_funding and not funding_verified then 'Funded Units report: Funding milestone' else funding_verified_by end,
        funding_note = case when not is_funding and not funding_verified and pipeline_status <> 'not_funded'
                            then 'Milestone in Funded Units report: ' || coalesce(r.x->>'last_milestone','blank') else funding_note end,
        last_seen_funded_at = now(), last_import_id = run_id
      where loan_number = r.loan_number;
      upd := upd + 1;
    end if;
    select * into existing from public.core_loans where loan_number = r.loan_number;
    if existing.pipeline_status = 'funding_exception' then
      ex := ex || jsonb_build_object('type','funding_exception','loan_number',r.loan_number,'milestone',r.x->>'last_milestone');
    end if;
    if existing.funding_verified then
      select count(*) into c from public.core_tasks where loan_number = r.loan_number and task_type in ('pc30','pc60','pc90')
         and status in ('open','attempted','needs_review') and due_date <> existing.closed_date + (substring(task_type from 3)::int);
      resched := resched + c;
      created := created + public.core_ensure_postclose_tasks(r.loan_number);
      -- Closed loans no longer need weekly Tuesday updates going forward
      update public.core_tasks set status = 'cancelled', review_note = 'Loan funded ' || existing.closed_date
       where loan_number = r.loan_number and task_type in ('tuesday','preclose','contract')
         and status in ('open','attempted') and due_date > existing.closed_date;
    end if;
  end loop;

  insert into public.core_import_runs(id, kind, file_name, source_rows, accepted_rows, duplicate_rows, loans_inserted,
     loans_updated, tasks_created, tasks_rescheduled, exceptions, status, imported_by)
  values (run_id, 'funded_units', p_file, src, accepted, dups, ins, upd, created, resched, ex,
          case when jsonb_array_length(ex) > 0 then 'partial' else 'ok' end, public.core_me_email());
  perform set_config('core.system_write', 'off', true);
  return jsonb_build_object('import_id', run_id, 'source_rows', src, 'accepted', accepted, 'duplicates', dups,
    'loans_inserted', ins, 'loans_updated', upd, 'tasks_created', created, 'tasks_rescheduled', resched, 'exceptions', ex);
end $$;

-- Mack: assign verified ownership (bulk). Moves only unfinished work.
create or replace function public.core_i_assign_loans(p_loans text[], p_lp text, p_note text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can assign ownership'; end if;
  if p_lp is not null and p_lp not in ('Gavin','Karen','Osgood','Jordan','Said','Isaak') then
    raise exception 'CORE_VALIDATION: Unknown Loan Partner %', p_lp;
  end if;
  perform set_config('core.system_write', 'on', true);
  update public.core_loans set lp_owner = p_lp,
         ownership_status = case when p_lp is null then 'unassigned' else 'verified' end,
         ownership_source = case when p_lp is null then null else 'manual' end,
         ownership_set_by = public.core_me_email(), ownership_set_at = now()
   where loan_number = any(p_loans);
  get diagnostics n = row_count;
  insert into public.core_task_events(task_id, loan_number, event_type, party, detail, actor)
  select t.id, t.loan_number, 'assignment', 'manager',
         'Owner ' || coalesce(t.owner_lp,'Unassigned') || ' -> ' || coalesce(p_lp,'Unassigned') || coalesce(' · ' || p_note, ''),
         public.core_me_email()
    from public.core_tasks t
   where t.loan_number = any(p_loans) and t.status in ('open','attempted','needs_review') and t.owner_lp is distinct from p_lp;
  update public.core_tasks set owner_lp = p_lp
   where loan_number = any(p_loans) and status in ('open','attempted','needs_review') and owner_lp is distinct from p_lp;
  perform set_config('core.system_write', 'off', true);
  return n;
end $$;

-- Mack: reconcile a non-Funding milestone from the Funded Units report
create or replace function public.core_i_resolve_funding(p_loan text, p_funded boolean, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare created integer := 0;
begin
  if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can reconcile funding'; end if;
  if length(trim(coalesce(p_note,''))) < 5 then raise exception 'CORE_VALIDATION: Document how funding was verified'; end if;
  perform set_config('core.system_write', 'on', true);
  update public.core_loans set
    funding_verified = p_funded,
    pipeline_status = case when p_funded then 'funded' else 'not_funded' end,
    funding_verified_by = public.core_me_email(), funding_verified_at = now(), funding_note = p_note
   where loan_number = p_loan;
  if not found then raise exception 'CORE_VALIDATION: Loan % not found', p_loan; end if;
  if p_funded then
    created := public.core_ensure_postclose_tasks(p_loan);
  else
    update public.core_tasks set status = 'cancelled', review_note = 'Not funded: ' || p_note
     where loan_number = p_loan and task_type in ('pc30','pc60','pc90') and status in ('open','attempted','needs_review');
  end if;
  perform set_config('core.system_write', 'off', true);
  return jsonb_build_object('loan_number', p_loan, 'funded', p_funded, 'tasks_created', created);
end $$;

-- ---------------------------------------------------------------------
-- Lock the tables: RLS on, no policies, no table privileges for API roles.
-- ---------------------------------------------------------------------
do $$ declare t text; p record; begin
  foreach t in array array['core_settings','core_access_keys','core_loans','core_tasks','core_task_events','core_day_signoffs',
                           'core_coverage','core_corrections','core_import_runs','core_audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
  for p in select policyname, tablename from pg_policies where schemaname = 'public' and tablename like 'core\_%' loop
    execute format('drop policy if exists %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;
revoke all on sequence public.core_audit_log_id_seq from anon, authenticated;

-- ---------------------------------------------------------------------
-- Browser API (all calls require the team-access key)
-- ---------------------------------------------------------------------
create or replace function public.core_api_session(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v text := public.core_auth(p_key);
begin
  return jsonb_build_object('tier', v, 'role', public.core_role(), 'launch_date', public.core_launch_date(), 'server_time', now());
end $$;

create or replace function public.core_api_load(p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.core_auth(p_key);
  return jsonb_build_object(
    'tier', current_setting('core.tier'),
    'server_time', now(),
    'launch_date', public.core_launch_date(),
    'tasks', coalesce((select jsonb_agg(to_jsonb(t) order by t.due_date) from public.core_tasks t where t.status <> 'cancelled'), '[]'),
    'loans', coalesce((select jsonb_agg(to_jsonb(l)) from public.core_loans l), '[]'),
    'coverage', coalesce((select jsonb_agg(to_jsonb(c) order by c.start_date desc) from public.core_coverage c where c.active and c.end_date >= public.core_today() - 30), '[]'),
    'corrections', coalesce((select jsonb_agg(to_jsonb(c) order by c.due_date) from public.core_corrections c), '[]'),
    'signoffs', coalesce((select jsonb_agg(to_jsonb(d) order by d.work_date desc) from public.core_day_signoffs d where d.work_date >= public.core_today() - 60), '[]'),
    'imports', coalesce((select jsonb_agg(to_jsonb(i) order by i.imported_at desc) from (select * from public.core_import_runs order by imported_at desc limit 30) i), '[]')
  );
end $$;

create or replace function public.core_api_events(p_key text, p_task uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform public.core_auth(p_key);
  return coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at desc) from public.core_task_events e where e.task_id = p_task), '[]');
end $$;

-- Apply a whitelisted patch to one task with optimistic concurrency.
create or replace function public.core_apply_task_patch(p_id uuid, p_version integer, p jsonb) returns public.core_tasks
language plpgsql security definer set search_path = public as $$
declare r public.core_tasks;
begin
  update public.core_tasks t set
    status            = case when p ? 'status' then p->>'status' else t.status end,
    borrower_outcome  = case when p ? 'borrower_outcome' then p->>'borrower_outcome' else t.borrower_outcome end,
    conversation_at   = case when p ? 'conversation_at' then (p->>'conversation_at')::timestamptz else t.conversation_at end,
    borrower_notes    = case when p ? 'borrower_notes' then p->>'borrower_notes' else t.borrower_notes end,
    service_update    = case when p ? 'service_update' then p->>'service_update' else t.service_update end,
    script_checks     = case when p ? 'script_checks' then coalesce(p->'script_checks','{}'::jsonb) else t.script_checks end,
    referral_requested= case when p ? 'referral_requested' then coalesce((p->>'referral_requested')::boolean,false) else t.referral_requested end,
    referral_response = case when p ? 'referral_response' then p->>'referral_response' else t.referral_response end,
    referral_name     = case when p ? 'referral_name' then p->>'referral_name' else t.referral_name end,
    referral_contact  = case when p ? 'referral_contact' then p->>'referral_contact' else t.referral_contact end,
    crm_reference     = case when p ? 'crm_reference' then p->>'crm_reference' else t.crm_reference end,
    followthrough_note= case when p ? 'followthrough_note' then p->>'followthrough_note' else t.followthrough_note end,
    referral_status   = case when p ? 'referral_status' then p->>'referral_status' else t.referral_status end,
    referral_loan_number = case when p ? 'referral_loan_number' then p->>'referral_loan_number' else t.referral_loan_number end,
    agent_outcome     = case when p ? 'agent_outcome' then p->>'agent_outcome' else t.agent_outcome end,
    agent_notes       = case when p ? 'agent_notes' then p->>'agent_notes' else t.agent_notes end,
    concern_status    = case when p ? 'concern_status' then coalesce(p->>'concern_status','none') else t.concern_status end,
    concern_notes     = case when p ? 'concern_notes' then p->>'concern_notes' else t.concern_notes end,
    escalated         = case when p ? 'escalated' then coalesce((p->>'escalated')::boolean,false) else t.escalated end,
    exception_kind    = case when p ? 'exception_kind' then p->>'exception_kind' else t.exception_kind end,
    exception_reason  = case when p ? 'exception_reason' then p->>'exception_reason' else t.exception_reason end,
    next_action       = case when p ? 'next_action' then p->>'next_action' else t.next_action end,
    next_action_date  = case when p ? 'next_action_date' then (p->>'next_action_date')::date else t.next_action_date end,
    review_note       = case when p ? 'review_note' then p->>'review_note' else t.review_note end,
    coverage_lp       = case when p ? 'coverage_lp' then p->>'coverage_lp' else t.coverage_lp end,
    coverage_until    = case when p ? 'coverage_until' then (p->>'coverage_until')::date else t.coverage_until end,
    due_date          = case when p ? 'due_date' then (p->>'due_date')::date else t.due_date end,
    owner_lp          = case when p ? 'owner_lp' then p->>'owner_lp' else t.owner_lp end
  where t.id = p_id and (p_version is null or t.row_version = p_version)
  returning * into r;
  return r;
end $$;

create or replace function public.core_api_save_task(p_key text, p_actor text, p_id uuid, p_version integer, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.core_tasks;
begin
  perform public.core_auth(p_key, p_actor);
  if public.core_role() not in ('lp','manager','admin') then raise exception 'CORE_FORBIDDEN: Read-only access'; end if;
  if p_version is null then raise exception 'CORE_VALIDATION: Record version required'; end if;
  r := public.core_apply_task_patch(p_id, p_version, coalesce(p_patch,'{}'::jsonb));
  if r.id is null then
    if exists (select 1 from public.core_tasks where id = p_id) then
      raise exception 'CORE_CONFLICT: This record was changed on another device. The latest version has been loaded; please review and save again';
    end if;
    raise exception 'CORE_VALIDATION: Record not found';
  end if;
  return to_jsonb(r);
end $$;

create or replace function public.core_api_bulk_tasks(p_key text, p_actor text, p_ids uuid[], p_patch jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare i uuid; n integer := 0; r public.core_tasks; allowed jsonb;
begin
  perform public.core_auth(p_key, p_actor);
  if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can update records in bulk'; end if;
  allowed := (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(coalesce(p_patch,'{}')) where key in ('coverage_lp','coverage_until','status','review_note'));
  if allowed ? 'status' and allowed->>'status' not in ('cancelled','open') then raise exception 'CORE_VALIDATION: Bulk status must be cancelled or open'; end if;
  foreach i in array coalesce(p_ids, '{}') loop
    if allowed->>'status' = 'cancelled' and not exists (select 1 from public.core_tasks where id = i and status = 'needs_review') then continue; end if;
    r := public.core_apply_task_patch(i, null, allowed);
    if r.id is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.core_api_log_events(p_key text, p_actor text, p_events jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare e jsonb; n integer := 0;
begin
  perform public.core_auth(p_key, p_actor);
  if public.core_role() not in ('lp','manager','admin') then raise exception 'CORE_FORBIDDEN: Read-only access'; end if;
  for e in select * from jsonb_array_elements(coalesce(p_events,'[]')) loop
    insert into public.core_task_events(task_id, loan_number, event_type, party, channel, detail, occurred_at)
    select t.id, t.loan_number, e->>'event_type', e->>'party', left(e->>'channel', 40), left(e->>'detail', 2000),
           coalesce((e->>'occurred_at')::timestamptz, now())
      from public.core_tasks t where t.id = (e->>'task_id')::uuid;
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function public.core_api_signoff(p_key text, p_actor text, p_lp text, p_date date, p_group text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.core_day_signoffs;
begin
  perform public.core_auth(p_key, p_actor);
  if p_date <> public.core_today() then raise exception 'CORE_VALIDATION: Only today can be signed off'; end if;
  insert into public.core_day_signoffs(lp, work_date, task_group) values (p_lp, p_date, p_group)
  on conflict (lp, work_date, task_group) do nothing returning * into r;
  if r.id is null then select * into r from public.core_day_signoffs where lp = p_lp and work_date = p_date and task_group = p_group; end if;
  return to_jsonb(r);
end $$;

create or replace function public.core_api_coverage(p_key text, p_actor text, p_action text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.core_coverage;
begin
  perform public.core_auth(p_key, p_actor);
  if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can manage coverage'; end if;
  if p_action = 'add' then
    insert into public.core_coverage(from_lp, to_lp, start_date, end_date, reason, created_by)
    values (p->>'from_lp', p->>'to_lp', (p->>'start_date')::date, (p->>'end_date')::date, nullif(p->>'reason',''), public.core_me_email())
    returning * into r;
  elsif p_action = 'end' then
    update public.core_coverage set active = false where id = (p->>'id')::uuid returning * into r;
  else raise exception 'CORE_VALIDATION: Unknown coverage action'; end if;
  return to_jsonb(r);
end $$;

create or replace function public.core_api_correction(p_key text, p_actor text, p_action text, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.core_corrections;
begin
  perform public.core_auth(p_key, p_actor);
  if p_action = 'create' then
    if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can assign corrections'; end if;
    insert into public.core_corrections(lp, task_id, loan_number, issue, expected_behavior, due_date, assigned_by)
    values (p->>'lp', nullif(p->>'task_id','')::uuid, nullif(p->>'loan_number',''), p->>'issue', nullif(p->>'expected_behavior',''), (p->>'due_date')::date, public.core_me_email())
    returning * into r;
  elsif p_action = 'resolve' then
    if public.core_role() not in ('lp','manager','admin') then raise exception 'CORE_FORBIDDEN: Read-only access'; end if;
    update public.core_corrections set status = 'resolved', resolution_note = p->>'resolution_note' where id = (p->>'id')::uuid returning * into r;
  elsif p_action in ('verify','reopen') then
    if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can verify corrections'; end if;
    update public.core_corrections set status = case when p_action = 'verify' then 'verified' else 'reopened' end,
           verification_note = coalesce(p->>'verification_note', verification_note)
     where id = (p->>'id')::uuid returning * into r;
  else raise exception 'CORE_VALIDATION: Unknown correction action'; end if;
  if r.id is null then raise exception 'CORE_VALIDATION: Correction not found'; end if;
  return to_jsonb(r);
end $$;

create or replace function public.core_api_loan_source(p_key text, p_actor text, p_loan text, p_category text, p_version integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.core_loans;
begin
  perform public.core_auth(p_key, p_actor);
  if not public.core_is_manager() then raise exception 'CORE_FORBIDDEN: Only the Production Manager can classify funding sources'; end if;
  update public.core_loans set funding_source_category = nullif(p_category,'') where loan_number = p_loan and row_version = p_version returning * into r;
  if r.loan_number is null then raise exception 'CORE_CONFLICT: This loan was changed on another device. Refresh and retry'; end if;
  return to_jsonb(r);
end $$;

create or replace function public.core_import_pipeline(p_key text, p_actor text, p_rows jsonb, p_file text, p_plan_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform public.core_auth(p_key, p_actor); return public.core_i_import_pipeline(p_rows, p_file, p_plan_date); end $$;
create or replace function public.core_import_funded(p_key text, p_actor text, p_rows jsonb, p_file text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform public.core_auth(p_key, p_actor); return public.core_i_import_funded(p_rows, p_file); end $$;
create or replace function public.core_assign_loans(p_key text, p_actor text, p_loans text[], p_lp text, p_note text default null) returns integer
language plpgsql security definer set search_path = public as $$
begin perform public.core_auth(p_key, p_actor); return public.core_i_assign_loans(p_loans, p_lp, p_note); end $$;
create or replace function public.core_resolve_funding(p_key text, p_actor text, p_loan text, p_funded boolean, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin perform public.core_auth(p_key, p_actor); return public.core_i_resolve_funding(p_loan, p_funded, p_note); end $$;

-- Execute privileges: only the key-checked API is callable from the browser.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'core\_%' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if f.proname like 'core\_api\_%' or f.proname in ('core_import_pipeline','core_import_funded','core_assign_loans','core_resolve_funding') then
      execute format('grant execute on function %s to anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------------
-- AFTER RUNNING: set the shared team link key and the manager passcode in
-- the SQL editor (values are stored only as SHA-256 hashes):
--
-- select public.core_set_access_key('team',    '<random 24+ character key>', 'Shared team link');
-- select public.core_set_access_key('manager', '<Mack passcode, 12+ characters>', 'Production Manager');
-- select public.core_set_access_key('admin',   '<Director passcode, 12+ characters>', 'Director');
--
-- Share the link with everyone:  https://pwang318.github.io/core-team-tracker/#team=<team key>
-- Mack enters the manager passcode once per device (Command Center > Manager sign-in).
-- Rotating: run core_set_access_key again for that tier; the old value stops working.
-- ---------------------------------------------------------------------
