begin;

create schema if not exists core_lp_private;
revoke all on schema core_lp_private from public, anon, authenticated;

create table if not exists public.core_lp_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_name text not null unique check (member_name in
    ('Gavin', 'Karen', 'Osgood', 'Jordan', 'Said', 'Isaak', 'Mack', 'Daniel'))
);

create table if not exists public.core_lp_funded_loans (
  loan_key text primary key check (loan_key ~ '^([0-9a-f]{20}|fnv[0-9a-f]+)$'),
  closed_on date not null check (isfinite(closed_on)),
  verified_owner text check (verified_owner in ('Gavin', 'Karen', 'Osgood', 'Jordan', 'Said', 'Isaak')),
  source_reference text not null check (length(btrim(source_reference)) between 1 and 120),
  recorded_at timestamptz not null default now()
);

create table if not exists public.core_lp_post_closing_tasks (
  loan_key text not null references public.core_lp_funded_loans(loan_key),
  milestone smallint not null check (milestone in (30, 60, 90)),
  original_due_on date not null,
  primary key (loan_key, milestone)
);

alter table public.core_lp_members enable row level security;
alter table public.core_lp_funded_loans enable row level security;
alter table public.core_lp_post_closing_tasks enable row level security;

revoke all on public.core_lp_members, public.core_lp_funded_loans,
  public.core_lp_post_closing_tasks from public, anon, authenticated;
grant select on public.core_lp_members, public.core_lp_funded_loans,
  public.core_lp_post_closing_tasks to authenticated;
grant insert (loan_key, closed_on, verified_owner, source_reference)
  on public.core_lp_funded_loans to authenticated;

drop policy if exists core_lp_member_self on public.core_lp_members;
create policy core_lp_member_self on public.core_lp_members for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists core_lp_funded_loan_read on public.core_lp_funded_loans;
create policy core_lp_funded_loan_read on public.core_lp_funded_loans for select to authenticated
  using (exists (
    select 1 from public.core_lp_members m
    where m.user_id = (select auth.uid())
      and (m.member_name = 'Mack' or m.member_name = verified_owner)
  ));

drop policy if exists core_lp_funded_loan_import on public.core_lp_funded_loans;
create policy core_lp_funded_loan_import on public.core_lp_funded_loans for insert to authenticated
  with check (closed_on <= (statement_timestamp() at time zone 'America/New_York')::date
    and exists (
      select 1 from public.core_lp_members m
      where m.user_id = (select auth.uid()) and m.member_name = 'Mack'
    ));

drop policy if exists core_lp_post_closing_read on public.core_lp_post_closing_tasks;
create policy core_lp_post_closing_read on public.core_lp_post_closing_tasks for select to authenticated
  using (exists (
    select 1 from public.core_lp_funded_loans loan
    where loan.loan_key = core_lp_post_closing_tasks.loan_key
  ));

create or replace function core_lp_private.schedule_post_closing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.core_lp_post_closing_tasks (loan_key, milestone, original_due_on)
    select new.loan_key, n, new.closed_on + n
    from (values (30), (60), (90)) as milestones(n);
  return new;
end;
$$;

revoke all on function core_lp_private.schedule_post_closing() from public, anon, authenticated;
drop trigger if exists core_lp_schedule_post_closing on public.core_lp_funded_loans;
create trigger core_lp_schedule_post_closing after insert on public.core_lp_funded_loans
  for each row execute function core_lp_private.schedule_post_closing();

commit;
