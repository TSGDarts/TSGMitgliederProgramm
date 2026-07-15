-- =====================================================================
-- Erweiterung: Heimspielzeiten je Mannschaft (für die Mannschaftsmeldung)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.teams
  add column if not exists home_match_weekday int
  check (home_match_weekday between 1 and 7);  -- 1 = Montag … 7 = Sonntag

alter table public.teams
  add column if not exists home_match_time text not null default ''; -- z. B. "20:00"
