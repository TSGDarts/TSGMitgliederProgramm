-- =====================================================================
-- Erweiterung: Board-Anzahl bei Gegnern
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.opponents
  add column if not exists boards int;
