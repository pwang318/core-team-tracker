-- Run against a disposable database after applying the CORE LP migrations.
begin;
insert into auth.users values ('70000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000002'), ('70000000-0000-4000-8000-000000000003');
insert into public.core_lp_members values
  ('70000000-0000-4000-8000-000000000001', 'Mack'),
  ('70000000-0000-4000-8000-000000000002', 'Gavin'),
  ('70000000-0000-4000-8000-000000000003', 'Karen');
set local role authenticated;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000001', true);
insert into public.core_lp_tuesday_assignments (loan_key,due_on,owner,source_reference)
  values ('70000000000000000001','2024-01-02','Gavin','synthetic report'),
         ('70000000000000000002','2024-01-09','Gavin','synthetic next week');
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000002', true);

do $$
declare example record;
begin
  for example in select * from (values
    ('voicemail','live',true,'none'),
    ('live','live',false,'none'),
    ('live','live',true,'named'),
    ('live','live',true,'returning-client'),
    ('live','voicemail',true,'none')
  ) cases(borrower,agent,asked,response)
  loop
    begin
      insert into public.core_lp_tuesday_contacts
        (request_id,loan_key,due_on,complete,borrower_outcome,agent_outcome,ccr_asked,ccr_response,notes,next_steps)
        values (gen_random_uuid(),'70000000000000000001','2024-01-02',true,
          example.borrower,example.agent,example.asked,example.response,'Synthetic notes','Synthetic next step');
      raise exception 'Invalid completion was accepted';
    exception when check_violation then null;
    end;
  end loop;
  begin
    insert into public.core_lp_tuesday_contacts
      (request_id,loan_key,due_on,complete,borrower_outcome,agent_outcome,ccr_asked,ccr_response,notes,next_steps)
      values (gen_random_uuid(),'70000000000000000001','2024-01-02',true,
        'live','exempt',true,'none','Synthetic notes','Synthetic next step');
    raise exception 'Unverified agent exemption was accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;

insert into public.core_lp_tuesday_contacts
  (request_id,loan_key,due_on,complete,borrower_outcome,agent_outcome,ccr_asked,ccr_response,notes,next_steps)
  values (gen_random_uuid(),'70000000000000000001','2024-01-02',false,
          'voicemail','pending',false,null,'Left a synthetic message','Call tomorrow'),
         (gen_random_uuid(),'70000000000000000001','2024-01-02',true,
          'live','live',true,'none','Discussed progress','Send update');

do $$
begin
  if (select array_agg(status order by due_on) from public.core_lp_tuesday_worklist)
      is distinct from array['complete','overdue'] then
    raise exception 'Completion carried into a different week';
  end if;
  if (select count(*) from public.core_lp_tuesday_contacts) <> 2 then
    raise exception 'Attempt history was not retained';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '70000000-0000-4000-8000-000000000003', true);
do $$
begin
  if exists (select 1 from public.core_lp_tuesday_worklist)
     or exists (select 1 from public.core_lp_tuesday_contacts) then
    raise exception 'An unrelated LP can read Tuesday records';
  end if;
end;
$$;
rollback;
