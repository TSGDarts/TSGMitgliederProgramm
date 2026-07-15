-- =====================================================================
-- Erweiterung: Geburtstag bei vorab angelegten Namen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.member_invites
  add column if not exists birthday date;
alter table public.member_invites
  add column if not exists birthday_public boolean not null default false;
