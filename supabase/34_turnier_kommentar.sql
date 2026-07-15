-- =====================================================================
-- Erweiterung: Kommentar-Feld für Turniere
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.tournaments
  add column if not exists notes text not null default '';
