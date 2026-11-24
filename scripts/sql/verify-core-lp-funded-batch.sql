-- Run against a disposable database after applying the CORE LP migrations.
begin;
insert into core_lp_private.post_closing_rollout (launch_on) values ('2024-03-01');
insert into auth.users values ('50000000-0000-4000-8000-000000000001'), ('50000000-0000-4000-8000-000000000002');
insert into public.core_lp_members values
  ('50000000-0000-4000-8000-000000000001', 'Mack'),
  ('50000000-0000-4000-8000-000000000002', 'Gavin');
set local role authenticated;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', true);
do $$
declare
  batch jsonb := '[
    {"loan_key":"50000000000000000001","closed_on":"2023-12-31","owner":"Gavin"},
    {"loan_key":"50000000000000000002","closed_on":"2024-01-01","owner":"Gavin"},
    {"loan_key":"50000000000000000003","closed_on":"2024-02-15","owner":"Gavin"},
    {"loan_key":"50000000000000000004","closed_on":"2024-03-01","owner":"Gavin"}
  ]';
begin
  if public.core_lp_import_funded_batch(batch, 'synthetic-report')
      is distinct from '{"imported":3,"unchanged":0,"needs_review":0,"outside_window":1}'::jsonb then
    raise exception 'Unexpected first import counts';
  end if;
  if public.core_lp_import_funded_batch(batch, 'synthetic-report')
      is distinct from '{"imported":0,"unchanged":3,"needs_review":0,"outside_window":1}'::jsonb then
    raise exception 'Unexpected replay counts';
  end if;
  if (select count(*) from public.core_lp_post_closing_tasks) <> 6 then
    raise exception 'Unexpected number of tasks';
  end if;

  begin
    perform public.core_lp_import_funded_batch('[
      {"loan_key":"50000000000000000005","closed_on":"2024-03-01","owner":"Gavin"},
      {"loan_key":"50000000000000000006","closed_on":"2024-03-01","owner":"Unknown"}
    ]', 'invalid-report');
    raise exception 'Invalid batch succeeded';
  exception when invalid_parameter_value then null;
  end;
  if (select count(*) from public.core_lp_funded_loans) <> 3 then
    raise exception 'Failed batch left partial data';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.core_lp_import_funded_batch('[]', 'synthetic-report');
    raise exception 'LP batch import succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
rollback;
