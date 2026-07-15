-- =====================================================================
-- Erweiterung: Trainer-Haken auch für vorab angelegte Namen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Vorbelegung durch den Admin; bei der Registrierung wandert der Haken
-- automatisch mit ins Profil.
alter table public.member_invites
  add column if not exists is_trainer boolean not null default false;
