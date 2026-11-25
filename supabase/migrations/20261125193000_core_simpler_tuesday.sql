-- Simpler Tuesday Updates (2026-11-25)
-- Tuesday Update only: notes are still required but have no minimum length, and a named
-- referral needs only the person's name (the Velocify reference is optional).
-- 30/60/90 and other calls keep their existing rules.

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
  if t.task_type = 'tuesday' then
    if length(trim(coalesce(t.borrower_notes,''))) < 1 then e := array_append(e, 'Update notes required'::text); end if;
  elsif length(trim(coalesce(t.borrower_notes,''))) < 20 then e := array_append(e, 'Borrower conversation notes required (20+ characters)'::text); end if;
  if t.task_type <> 'tuesday' then
    foreach k in array public.core_required_checks(t.task_type) loop
      if not (coalesce((t.script_checks ->> k)::boolean, false)
              or (k = 'rate_drop_pledge' and coalesce((t.script_checks ->> 'rate_drop_na')::boolean, false))) then
        e := array_append(e, 'Conversation step not confirmed: ' || k);
      end if;
    end loop;
  end if;
  if not t.referral_requested then e := array_append(e, 'Explicit confirmation that the referral was requested is required'::text); end if;
  if t.task_type <> 'contract' and t.referral_response is null then e := array_append(e, 'Referral response required'::text); end if;
  if t.referral_response = 'named_introduction' then
    if length(trim(coalesce(t.referral_name,''))) < 2 then e := array_append(e, 'Named introduction requires the referral name'::text); end if;
    if t.task_type <> 'tuesday' and length(trim(coalesce(t.crm_reference,''))) < 3 then
      e := array_append(e, 'Named introduction requires the CRM (Velocify) reference'::text);
    end if;
  end if;
  if t.concern_status = 'unresolved' then
    e := array_append(e, 'Unresolved client concern: record service recovery instead of completing'::text);
  end if;
  if t.concern_status = 'resolved' and length(trim(coalesce(t.concern_notes,''))) < 10 then
    e := array_append(e, 'Describe the concern and how it was resolved'::text);
  end if;
  if t.task_type <> 'tuesday' or nullif(trim(t.next_action), '') is not null then
    if length(trim(coalesce(t.next_action,''))) < 3 then e := array_append(e, 'Next action required'::text); end if;
    if t.next_action_date is null then e := array_append(e, 'Follow-up date required'::text); end if;
  end if;
  if t.task_type = 'tuesday' then
    select buyer_agent_name into ba from public.core_loans where loan_number = t.loan_number;
    if public.core_has_buyer_agent(ba) and (t.agent_outcome is null or t.agent_outcome in ('attempted','no_buyer_agent')) then
      e := array_append(e, 'Buyer agent update required'::text);
    end if;
  end if;
  return e;
end $$;
