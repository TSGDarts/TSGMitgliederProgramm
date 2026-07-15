-- =====================================================================
-- Erweiterung: Kapitän/Vize auch für vorab angelegte Namen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Bei der Registrierung wandert die Rolle automatisch mit.
-- =====================================================================

alter table public.member_invites
  add column if not exists captain_of uuid references public.teams (id) on delete set null;

alter table public.member_invites
  add column if not exists vice_of uuid references public.teams (id) on delete set null;
