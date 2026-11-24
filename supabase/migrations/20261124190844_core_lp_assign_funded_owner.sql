begin;

alter table public.core_lp_funded_loans
  add column if not exists assignment_revision integer not null default 0;

create table if not exists public.core_lp_funded_assignment_history (
  loan_key text not null references public.core_lp_funded_loans (loan_key),
  revision integer not null,
  previous_owner text,
  assigned_owner text,
  assigned_by uuid not null,
  reason text not null,
  assigned_at timestamptz not null default now(),
  primary key (loan_key, revision)
);

alter table public.core_lp_funded_assignment_history enable row level security;
revoke all on public.core_lp_funded_assignment_history from public, anon, authenticated;
grant select on public.core_lp_funded_assignment_history to authenticated;

drop policy if exists core_lp_funded_assignment_history_read on public.core_lp_funded_assignment_history;
create policy core_lp_funded_assignment_history_read
  on public.core_lp_funded_assignment_history for select to authenticated
  using (exists (
    select 1 from public.core_lp_members
    where user_id = (select auth.uid()) and member_name = 'Mack'
  ));

create or replace function core_lp_private.assign_funded_owner(
  p_loan_key text, p_expected_revision integer, p_owner text, p_reason text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  existing public.core_lp_funded_loans%rowtype;
  next_revision integer;
begin
  if not exists (
    select 1 from public.core_lp_members where user_id = actor and member_name = 'Mack'
  ) then
    raise exception 'Mack access is required to assign funded loans.' using errcode = '42501';
  end if;
  if p_reason is null or length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'Enter a reason for the assignment change.' using errcode = '22023';
  end if;

  select * into strict existing from public.core_lp_funded_loans
    where loan_key = p_loan_key for update;
  if existing.assignment_revision is distinct from p_expected_revision then
    raise exception 'Assignment changed. Refresh and try again.' using errcode = '40001';
  end if;
  if existing.verified_owner is not distinct from p_owner then
    return existing.assignment_revision;
  end if;

  next_revision := existing.assignment_revision + 1;
  update public.core_lp_funded_loans
    set verified_owner = p_owner, assignment_revision = next_revision
    where loan_key = p_loan_key;
  insert into public.core_lp_funded_assignment_history
    (loan_key, revision, previous_owner, assigned_owner, assigned_by, reason)
    values (p_loan_key, next_revision, existing.verified_owner, p_owner, actor, btrim(p_reason));
  return next_revision;
end;
$$;

revoke all on function core_lp_private.assign_funded_owner(text, integer, text, text) from public, anon, authenticated;
grant usage on schema core_lp_private to authenticated;
grant execute on function core_lp_private.assign_funded_owner(text, integer, text, text) to authenticated;

create or replace function public.core_lp_assign_funded_owner(
  p_loan_key text, p_expected_revision integer, p_owner text, p_reason text
) returns integer
language sql
security invoker
set search_path = ''
as $$
  select core_lp_private.assign_funded_owner(p_loan_key, p_expected_revision, p_owner, p_reason);
$$;

revoke all on function public.core_lp_assign_funded_owner(text, integer, text, text) from public, anon, authenticated;
grant execute on function public.core_lp_assign_funded_owner(text, integer, text, text) to authenticated;

commit;
