-- =====================================================================
-- Erweiterung: Standard-Erinnerungen 7 + 3 Tage vorher (für alle Arten)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Neue Mitglieder starten mit 7 + 3 Tagen bei allen Termin-Arten
alter table public.profiles
  alter column notify_erinnerungen set default
  '{"punktspiele":[7,3],"pokal":[7,3],"freundschaft":[7,3],"training":[7,3],"verein":[7,3],"turniere":[7,3]}'::jsonb;

-- Bestehende Mitglieder ohne eigene Auswahl bekommen den Standard ebenfalls
-- (auch die automatisch übernommene alte "Turniere: 7 Tage"-Einstellung)
update public.profiles
set notify_erinnerungen =
  '{"punktspiele":[7,3],"pokal":[7,3],"freundschaft":[7,3],"training":[7,3],"verein":[7,3],"turniere":[7,3]}'::jsonb
where notify_erinnerungen = '{}'::jsonb
   or notify_erinnerungen = '{"turniere": [7]}'::jsonb;
