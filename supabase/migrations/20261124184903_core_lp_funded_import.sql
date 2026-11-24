begin;

create table if not exists public.core_lp_funded_import_reviews (
  id bigint generated always as identity primary key,
  loan_key text not null references public.core_lp_funded_loans (loan_key),
  incoming_closed_on date not null check (isfinite(incoming_closed_on)),
  incoming_owner text check (incoming_owner in ('Gavin', 'Karen', 'Osgood', 'Jordan', 'Said', 'Isaak')),
  source_reference text not null check (length(btrim(source_reference)) between 1 and 120),
  reported_at timestamptz not null default now(),
  unique nulls not distinct (loan_key, incoming_closed_on, incoming_owner, source_reference)
);

alter table public.core_lp_funded_import_reviews enable row level security;
revoke all on public.core_lp_funded_import_reviews from public, anon, authenticated;
grant select on public.core_lp_funded_import_reviews to authenticated;
grant insert (loan_key, incoming_closed_on, incoming_owner, source_reference)
  on public.core_lp_funded_import_reviews to authenticated;

drop policy if exists core_lp_funded_import_review_read on public.core_lp_funded_import_reviews;
create policy core_lp_funded_import_review_read
  on public.core_lp_funded_import_reviews for select to authenticated
  using (exists (
    select 1 from public.core_lp_members
    where user_id = (select auth.uid()) and member_name = 'Mack'
  ));

drop policy if exists core_lp_funded_import_review_write on public.core_lp_funded_import_reviews;
create policy core_lp_funded_import_review_write
  on public.core_lp_funded_import_reviews for insert to authenticated
  with check (exists (
    select 1 from public.core_lp_members
    where user_id = (select auth.uid()) and member_name = 'Mack'
  ));

create or replace function public.core_lp_import_funded_loan(
  p_loan_key text,
  p_closed_on date,
  p_verified_owner text,
  p_source_reference text
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing public.core_lp_funded_loans%rowtype;
begin
  insert into public.core_lp_funded_loans (loan_key, closed_on, verified_owner, source_reference)
    values (p_loan_key, p_closed_on, p_verified_owner, btrim(p_source_reference))
    on conflict (loan_key) do nothing;
  if found then
    return 'imported';
  end if;

  select * into strict existing
    from public.core_lp_funded_loans
    where loan_key = p_loan_key;

  if existing.closed_on = p_closed_on
     and existing.verified_owner is not distinct from p_verified_owner then
    return 'unchanged';
  end if;

  insert into public.core_lp_funded_import_reviews
    (loan_key, incoming_closed_on, incoming_owner, source_reference)
    values (p_loan_key, p_closed_on, p_verified_owner, btrim(p_source_reference))
    on conflict (loan_key, incoming_closed_on, incoming_owner, source_reference) do nothing;
  return 'needs_review';
end;
$$;

revoke all on function public.core_lp_import_funded_loan(text, date, text, text)
  from public, anon, authenticated;
grant execute on function public.core_lp_import_funded_loan(text, date, text, text)
  to authenticated;

commit;
