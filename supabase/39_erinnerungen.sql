-- =====================================================================
-- Erweiterung: Erinnerungen je Termin-Art mit mehreren Zeitpunkten
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Je Termin-Art eine Liste von Vorlaufzeiten in Tagen, z. B.
-- {"turniere":[14,7,1],"punktspiele":[1]}
alter table public.profiles
  add column if not exists notify_erinnerungen jsonb not null default '{}'::jsonb;

-- Bisherige Turnier-Erinnerung übernehmen
update public.profiles
set notify_erinnerungen =
  jsonb_build_object('turniere', jsonb_build_array(notify_turnier_tage))
where notify_turnier_tage > 0
  and notify_erinnerungen = '{}'::jsonb;
