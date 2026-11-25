-- Let LPs record the buyer agent on a loan from the call form (2026-11-25).
-- Used when the Funded Units report only has the brokerage, or no agent at all.
create or replace function public.core_api_loan_agent(p_key text, p_actor text, p_loan text, p_name text, p_phone text, p_email text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.core_loans;
begin
  perform public.core_auth(p_key, p_actor);
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'CORE_VALIDATION: Enter the buyer agent''s name'; end if;
  update public.core_loans set
    buyer_agent_name = left(trim(p_name), 120),
    buyer_agent_phone = coalesce(nullif(left(trim(coalesce(p_phone,'')), 40), ''), buyer_agent_phone),
    buyer_agent_email = coalesce(nullif(left(trim(coalesce(p_email,'')), 160), ''), buyer_agent_email)
  where loan_number = p_loan
  returning * into r;
  if r.loan_number is null then raise exception 'CORE_VALIDATION: This loan was not found. Refresh and retry'; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.core_api_loan_agent(text, text, text, text, text, text) from public;
grant execute on function public.core_api_loan_agent(text, text, text, text, text, text) to anon, authenticated;
