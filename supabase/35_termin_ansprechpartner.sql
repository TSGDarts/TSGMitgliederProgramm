-- =====================================================================
-- Erweiterung: Ansprechpartner an Terminen (mehrere möglich)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.events
  add column if not exists contact_ids uuid[] not null default '{}';
