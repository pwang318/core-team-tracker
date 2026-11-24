-- Run against a disposable database after applying the CORE LP migrations.
begin;
insert into core_lp_private.post_closing_rollout (launch_on) values ('2024-01-01');
insert into auth.users values ('60000000-0000-4000-8000-000000000001'), ('60000000-0000-4000-8000-000000000002');
insert into public.core_lp_members values
  ('60000000-0000-4000-8000-000000000001', 'Gavin'),
  ('60000000-0000-4000-8000-000000000002', 'Karen');
insert into public.core_lp_funded_loans (loan_key, closed_on, verified_owner, source_reference)
  values ('60000000000000000001', '2024-01-01', 'Gavin', 'test');
set local role authenticated;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000001', true);
do $$
declare
  attempt jsonb := '{"outcome":"voicemail","notes":"Left a synthetic message","followUp":"2099-01-01"}';
  evidence jsonb := '{"outcome":"live","asked":true,"topics":["settling-in","mortgage-statement","first-payment-and-servicing","questions-and-concerns","offer-of-assistance"],"response":"none","notes":"Discussed servicing","nextSteps":"Send servicing information"}';
  request_id uuid := '61000000-0000-4000-8000-000000000001';
  saved_at timestamptz;
begin
  begin
    perform public.core_lp_record_post_closing_call(request_id, '60000000000000000001', 30, true, attempt);
    raise exception 'Voicemail marked complete';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.core_lp_record_post_closing_call(request_id, '60000000000000000001', 30, true,
      evidence || '{"response":"named"}');
    raise exception 'Named referral without reference marked complete';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.core_lp_record_post_closing_call(request_id, '60000000000000000001', 30, true, evidence - 'asked');
    raise exception 'Missing PCR marked complete';
  exception when invalid_parameter_value then null;
  end;

  saved_at := public.core_lp_record_post_closing_call(request_id, '60000000000000000001', 30, false, attempt);
  if public.core_lp_record_post_closing_call(request_id, '60000000000000000001', 30, false, attempt)
     is distinct from saved_at then
    raise exception 'Retry timestamp changed';
  end if;
  perform public.core_lp_record_post_closing_call('61000000-0000-4000-8000-000000000002',
    '60000000000000000001', 30, false, attempt || '{"outcome":"client-concern"}');
  perform public.core_lp_record_post_closing_call('61000000-0000-4000-8000-000000000003',
    '60000000000000000001', 30, true, evidence);
  if (select count(*) from public.core_lp_post_closing_calls) <> 3
     or (select count(*) from public.core_lp_post_closing_calls where complete) <> 1 then
    raise exception 'Expected two attempts and one completion';
  end if;
  if not exists (
    select 1 from public.core_lp_post_closing_worklist
    where loan_key = '60000000000000000001' and milestone = 30
      and attempt_count = 2 and completed_at is not null
      and latest_outcome = 'live' and original_due_on = date '2024-01-31'
  ) then
    raise exception 'Worklist does not reflect recorded activity';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '60000000-0000-4000-8000-000000000002', true);
do $$
begin
  if exists (select 1 from public.core_lp_post_closing_calls)
     or exists (select 1 from public.core_lp_post_closing_worklist) then
    raise exception 'Unassigned LP can read call history';
  end if;
  begin
    perform public.core_lp_record_post_closing_call(gen_random_uuid(), '60000000000000000001', 60, false, '{}');
    raise exception 'Unassigned LP can record a call';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
