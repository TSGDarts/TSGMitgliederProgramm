-- =====================================================================
-- Erweiterung: Erinnerung auch nach Absage (pro Mitglied wählbar)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.profiles
  add column if not exists notify_trotz_absage boolean not null default false;
