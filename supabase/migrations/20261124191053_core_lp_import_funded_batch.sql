begin;

create or replace function core_lp_private.get_post_closing_launch_date()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select launch_on from core_lp_private.post_closing_rollout where singleton;
$$;

revoke all on function core_lp_private.get_post_closing_launch_date() from public, anon, authenticated;
grant execute on function core_lp_private.get_post_closing_launch_date() to authenticated;

create or replace function public.core_lp_import_funded_batch(
  p_loans jsonb, p_source_reference text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  launch_date date;
  today date := (statement_timestamp() at time zone 'America/New_York')::date;
  loan record;
  result text;
  counts jsonb := '{"imported":0,"unchanged":0,"needs_review":0,"outside_window":0}';
begin
  if not exists (
    select 1 from public.core_lp_members
    where user_id = (select auth.uid()) and member_name = 'Mack'
  ) then
    raise exception 'Mack access is required to import funded workbooks.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_loans) is distinct from 'array'
     or p_source_reference is null
     or length(btrim(p_source_reference)) not between 1 and 120 then
    raise exception 'A funded-loan array and source reference are required.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_loans) not between 1 and 2000 then
    raise exception 'Import between 1 and 2000 funded loans per batch.' using errcode = '22023';
  end if;
  launch_date := core_lp_private.get_post_closing_launch_date();
  if launch_date is null then
    raise exception 'Set the post-closing launch date before importing funded loans.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_loans) as entry(loan_key text)
    group by loan_key having count(*) > 1
  ) then
    raise exception 'Resolve duplicate loan keys before importing.' using errcode = '22023';
  end if;

  for loan in
    select * from jsonb_to_recordset(p_loans) as entry(loan_key text, closed_on date, owner text)
    order by loan_key
  loop
    if loan.loan_key is null or loan.loan_key !~ '^([0-9a-f]{20}|fnv[0-9a-f]+)$'
       or loan.closed_on is null or not isfinite(loan.closed_on) or loan.closed_on > today
       or loan.owner not in ('Gavin', 'Karen', 'Osgood', 'Jordan', 'Said', 'Isaak') then
      raise exception 'The batch includes an invalid loan key, closing date, or LP.' using errcode = '22023';
    end if;

    if loan.closed_on < launch_date - 60 then
      result := 'outside_window';
    else
      result := public.core_lp_import_funded_loan(loan.loan_key, loan.closed_on, loan.owner, p_source_reference);
    end if;
    counts := jsonb_set(counts, array[result], to_jsonb((counts ->> result)::integer + 1));
  end loop;

  return counts;
end;
$$;

revoke all on function public.core_lp_import_funded_batch(jsonb, text) from public, anon, authenticated;
grant execute on function public.core_lp_import_funded_batch(jsonb, text) to authenticated;

commit;
