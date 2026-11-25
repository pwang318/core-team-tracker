-- Open LP access (2026-11-25)
-- The plain tracker link (https://pwang318.github.io/core-team-tracker/) now gives every
-- LP their full call list. No team link or code is required.
-- Manager and Director passcodes still work exactly as before and are still required for
-- manager-only actions (imports, assignment, coverage, bulk review, funding review).
-- Note: because the site and repository are public, anyone with the URL can now read and
-- log LP calls (borrower names and closing dates). Undo with the "restore" block below.

create or replace function public.core_auth(p_key text, p_actor text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v_tier text;
begin
  if length(coalesce(p_key,'')) >= 12 then
    select tier into v_tier from public.core_access_keys where key_hash = encode(digest(p_key, 'sha256'), 'hex');
  end if;
  -- No passcode (or an old/unknown team link) = LP team access.
  v_tier := coalesce(v_tier, 'team');
  perform set_config('core.tier', v_tier, true);
  perform set_config('core.actor', left(coalesce(nullif(trim(p_actor), ''), initcap(v_tier)), 60), true);
  return v_tier;
end $$;

-- To restore the team-link requirement, run the core_auth definition from
-- 20261124_core_execution.sql again.
