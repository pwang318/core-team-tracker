-- FSBO loans have no buyer agent (2026-11-25): "FSBO" / "FSBO FSBO" / "For Sale By Owner"
-- no longer force a buyer-agent step on Tuesday Updates.
create or replace function public.core_has_buyer_agent(p_name text) returns boolean
language sql immutable as $$
  select coalesce(nullif(regexp_replace(lower(trim(coalesce(p_name,''))), '^(none none|none|n/?a|na|jane doe|john doe|-|fsbo|fsbo fsbo|for sale by owner)$', ''), ''), '') <> ''
$$;
