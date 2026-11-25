alter table public.core_forecast_reviews add column status_since timestamptz;
update public.core_forecast_reviews set status_since = reviewed_at;
alter table public.core_forecast_reviews alter column status_since set not null;
alter table public.core_forecast_reviews alter column status_since set default now();

create function public.core_forecast_start_status() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.estimated_date is distinct from old.estimated_date then
    new.status_since := new.reviewed_at;
  else
    new.status_since := old.status_since;
  end if;
  return new;
end
$$;

create trigger core_forecast_start_status
before update on public.core_forecast_reviews
for each row execute function public.core_forecast_start_status();

revoke all on function public.core_forecast_start_status() from public, anon, authenticated;
