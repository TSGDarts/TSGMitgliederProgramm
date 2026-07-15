-- =====================================================================
-- Erweiterung: Erlaubnis, in der Mitgliedergruppe zu gratulieren
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Eigene Zustimmung: Darf mir in der Mitgliedergruppe (z. B. WhatsApp)
-- zum Geburtstag gratuliert werden? Standard: nein (Opt-in).
alter table public.profiles
  add column if not exists birthday_congrats boolean not null default false;

-- Auch für vorab angelegte Namen (Vorbelegung durch den Admin;
-- bei der Registrierung entscheidet die Person selbst neu).
alter table public.member_invites
  add column if not exists birthday_congrats boolean not null default false;
