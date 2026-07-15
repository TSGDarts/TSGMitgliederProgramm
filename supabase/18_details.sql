-- =====================================================================
-- Erweiterung: getrennte Adressfelder, Treffpunkte, Boards im Feed
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Gegner: Adresse getrennt (Straße / PLZ / Ort); "address" bleibt als
-- zusammengesetzte Anzeige-Adresse erhalten.
alter table public.opponents
  add column if not exists street text not null default '';
alter table public.opponents
  add column if not exists zip text not null default '';
alter table public.opponents
  add column if not exists city text not null default '';

-- Termine: optionale Treffpunkte (Uhrzeiten)
alter table public.events
  add column if not exists meet_home_time text not null default '';   -- Treffpunkt bei der TSG
alter table public.events
  add column if not exists meet_venue_time text not null default '';  -- Treffpunkt vor Ort

-- Feed: Anzahl der Dartboards je Competition-Termin
alter table public.competition_dates
  add column if not exists boards int;
