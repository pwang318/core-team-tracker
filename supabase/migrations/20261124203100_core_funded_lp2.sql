begin;

create or replace function public.core_i_import_funded(p_rows jsonb, p_file text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  run_id uuid := gen_random_uuid(); r record; existing public.core_loans; c integer;
  ins integer := 0; upd integer := 0; created integer := 0; resched integer := 0; accepted integer := 0;
  src integer := jsonb_array_length(coalesce(p_rows,'[]'::jsonb)); dups integer := 0; ex jsonb := '[]'::jsonb;
  is_funding boolean; v_closed date; v_lp text; owner_conflict boolean;
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

  for r in select loan_number, (array_agg(x order by ord desc))[1] as x,
      count(distinct nullif(x->>'closed_date','')) as closing_variants,
      count(distinct coalesce(public.core_lp_short(x->>'lp2'),nullif(lower(btrim(x->>'lp2')),''))) as lp_variants,
      min(public.core_lp_short(x->>'lp2')) as lp
    from _f group by loan_number order by loan_number loop
    if r.closing_variants > 1 then
      ex := ex || jsonb_build_object('type','closing_date_conflict','loan_number',r.loan_number);
      continue;
    end if;
    v_closed := nullif(r.x->>'closed_date','')::date;
    if v_closed is null then
      ex := ex || jsonb_build_object('type','missing_closed_date','loan_number',r.loan_number);
      continue;
    end if;
    accepted := accepted + 1;
    is_funding := lower(trim(coalesce(r.x->>'last_milestone',''))) = 'funding';
    select * into existing from public.core_loans where loan_number = r.loan_number for update;
    v_lp := r.lp;
    owner_conflict := r.lp_variants > 1 or
      (coalesce(existing.ownership_source,'') <> 'manual' and v_lp is not null
        and existing.lp_owner is not null and existing.lp_owner <> v_lp)
      or (coalesce(existing.ownership_source,'') <> 'manual' and existing.lp_owner is not null
        and r.lp_variants = 1 and v_lp is null);
    if owner_conflict then
      ex := ex || jsonb_build_object('type','lp_conflict','loan_number',r.loan_number);
    end if;
    if existing.loan_number is null then
      insert into public.core_loans(loan_number, borrower_name, last_milestone, closed_date, est_closing_date, loan_type,
        buyer_agent_name, referral_source_name, loan_officer, loan_processor, property_address, property_city, property_state,
        pipeline_status, funding_verified, funding_verified_at, funding_verified_by, funding_note,
        lp_owner, ownership_status, ownership_source, ownership_set_at, last_seen_funded_at, last_import_id)
      values (r.loan_number, nullif(trim(r.x->>'borrower_name'),''), nullif(trim(r.x->>'last_milestone'),''), v_closed,
        nullif(r.x->>'est_closing_date','')::date, nullif(trim(r.x->>'loan_type'),''),
        nullif(trim(r.x->>'buyer_agent_name'),''), nullif(trim(r.x->>'referral_source_name'),''),
        nullif(trim(r.x->>'loan_officer'),''), nullif(trim(r.x->>'loan_processor'),''),
        nullif(trim(r.x->>'property_address'),''), nullif(trim(r.x->>'property_city'),''), nullif(trim(r.x->>'property_state'),''),
        case when is_funding then 'funded' else 'funding_exception' end, is_funding,
        case when is_funding then now() end, case when is_funding then 'Funded Units report: Funding milestone' end,
        case when is_funding then null else 'Milestone in Funded Units report: ' || coalesce(r.x->>'last_milestone','blank') end,
        case when not owner_conflict then v_lp end,
        case when owner_conflict then 'conflict' when v_lp is null then 'unassigned' else 'verified' end,
        case when not owner_conflict and v_lp is not null then 'funded_lp2' end,
        case when not owner_conflict and v_lp is not null then now() end,
        now(), run_id);
      ins := ins + 1;
    else
      update public.core_loans set
        borrower_name = coalesce(nullif(trim(r.x->>'borrower_name'),''), borrower_name),
        last_milestone = coalesce(nullif(trim(r.x->>'last_milestone'),''), last_milestone),
        closed_date = v_closed,
        lp_owner = case when ownership_source = 'manual' then lp_owner
          when owner_conflict then null
          when ownership_status = 'conflict' then lp_owner else coalesce(v_lp,lp_owner) end,
        ownership_status = case when ownership_source = 'manual' then ownership_status
          when owner_conflict or ownership_status = 'conflict' then 'conflict'
          when v_lp is not null then 'verified' else ownership_status end,
        ownership_source = case when ownership_source = 'manual' then ownership_source
          when owner_conflict then null
          when ownership_status <> 'conflict' and v_lp is not null then 'funded_lp2' else ownership_source end,
        ownership_set_at = case when ownership_source is distinct from 'manual'
          and not owner_conflict and ownership_status <> 'conflict' and v_lp is not null
          then coalesce(ownership_set_at,now()) else ownership_set_at end,
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
         and status in ('open','attempted','needs_review') and due_date <> existing.closed_date + (substring(task_type from 3)::int)
         and (existing.closed_date >= public.core_launch_date()
           or (task_type in ('pc30','pc60') and existing.closed_date + substring(task_type from 3)::int >= public.core_launch_date()));
      resched := resched + c;
      created := created + public.core_ensure_postclose_tasks(r.loan_number);
      update public.core_tasks set owner_lp = existing.lp_owner
        where loan_number = r.loan_number and task_type in ('pc30','pc60','pc90')
          and status in ('open','attempted','needs_review')
          and owner_lp is distinct from existing.lp_owner;
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

commit;
