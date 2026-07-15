-- =====================================================================
-- Erweiterung: Spielmodus je Mannschaft + Turnier-Erinnerung in Tagen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Liga-Spielmodus pro Mannschaft (Teams spielen in unterschiedlichen Ligen)
alter table public.teams
  add column if not exists spielmodus text not null default '';

-- Turnier-Erinnerung: frei wählbare Anzahl Tage vorher (0 = aus)
alter table public.profiles
  add column if not exists notify_turnier_tage int not null default 0
  check (notify_turnier_tage between 0 and 30);

-- Bisherige „1 Woche vorher“-Abonnenten übernehmen
update public.profiles
set notify_turnier_tage = 7
where notify_turnier_woche and notify_turnier_tage = 0;
