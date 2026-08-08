-- =====================================================================
-- Erweiterung: Kapitän/Vize auch für vorab angelegte Namen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Hinweis (Stand 2026-07-23): Bei der Registrierung wird die Rolle NICHT
-- mehr automatisch übernommen – Kader und Kapitäns-Rollen pflegt der Admin
-- unter „Mannschaften verwalten“ bzw. über die Saisonplanung.
-- =====================================================================

alter table public.member_invites
  add column if not exists captain_of uuid references public.teams (id) on delete set null;

alter table public.member_invites
  add column if not exists vice_of uuid references public.teams (id) on delete set null;
