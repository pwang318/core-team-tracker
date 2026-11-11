-- RM transaction work-queue safeguard, deployed to the Core team Supabase database on 2026-11-11.
-- Transaction call statuses continue to be owned by the transaction module.
-- Prevent stale Follow-up-sourced CTC/New Contract cards from resurfacing in the RM Today queue.
create or replace function public.rm_prevent_duplicate_transaction_followup_queue()
returns trigger language plpgsql set search_path=public as $$
begin
  if lower(coalesce(new.source,'')) = 'follow-up'
     and lower(trim(coalesce(new.activity_type,''))) in
       ('ctc call','clear to close','under contract call','new contract','new contract call')
     and lower(coalesce(new.status,'')) = 'open'
  then
    new.status := 'worked';
    new.completed_at := coalesce(new.completed_at,now());
    new.updated_at := now();
    new.carry_forward_reason :=
      'Reconciled: transaction calls are managed in the transaction workflow, not the RM catch-up queue';
  end if;
  return new;
end $$;
drop trigger if exists rm_prevent_duplicate_transaction_followup_queue_trigger on public.rm_work_queue;
create trigger rm_prevent_duplicate_transaction_followup_queue_trigger
before insert or update on public.rm_work_queue
for each row execute function public.rm_prevent_duplicate_transaction_followup_queue();
