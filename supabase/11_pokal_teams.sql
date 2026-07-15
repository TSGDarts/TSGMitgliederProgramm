-- =====================================================================
-- Erweiterung: Mehrere Pokal-Mannschaften pro Pokal
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.pokal_squads
  add column if not exists team_no int not null default 1;

alter table public.seasons
  add column if not exists pokal_ku_teams int not null default 1;
alter table public.seasons
  add column if not exists pokal_8er_teams int not null default 1;
