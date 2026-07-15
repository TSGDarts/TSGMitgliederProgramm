-- =====================================================================
-- Erweiterung: Rahmentermine löschen, Geburtstage, Boards bei Competitions
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Alle über den Rahmenterminplan eingespielten Termine entfernen
delete from public.events where source_uid like 'rahmen:%';

-- Geburtstag (Pflicht bei der Selbst-Anmeldung) + Sichtbarkeit im
-- Mitglieder-Kalender (frei wählbar). Taucht in KEINEM Feed auf.
alter table public.profiles
  add column if not exists birthday date;
alter table public.profiles
  add column if not exists birthday_public boolean not null default false;

-- Anzahl Dartboards bei den wöchentlichen Competitions
alter table public.competitions
  add column if not exists boards int;
