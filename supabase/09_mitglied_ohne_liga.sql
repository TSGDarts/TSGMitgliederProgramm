-- =====================================================================
-- Erweiterung: Rolle "Mitglied (ohne Liga)"
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Fügt die dritte Rolle 'member' hinzu: Vereinsmitglied ohne
-- Liga-Spielbetrieb (nur Grundfunktionen, keine Saisonabfrage/Kader).
-- =====================================================================

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'player', 'member'));

alter table public.member_invites
  drop constraint if exists member_invites_role_check;
alter table public.member_invites
  add constraint member_invites_role_check
  check (role in ('admin', 'player', 'member'));
