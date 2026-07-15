-- =====================================================================
-- Erweiterung: Turniere mit Zeitraum + "Details folgen"
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Optionales Turnierende (für mehrtägige Turniere, z. B. ein Wochenende)
alter table public.tournaments
  add column if not exists ends_at timestamptz;

-- "Noch keine Details verfügbar" – Anzeige "Details folgen"
alter table public.tournaments
  add column if not exists details_tbd boolean not null default false;
