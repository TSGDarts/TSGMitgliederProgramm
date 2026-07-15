-- =====================================================================
-- Erweiterung: "Genaue Uhrzeit folgt noch" bei Terminen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.events
  add column if not exists time_tbd boolean not null default false;
