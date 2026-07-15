-- =====================================================================
-- Einmal-Import: Vereinstermine aus der Competition-App übernehmen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Gleicht ab: Termine, die es (gleicher Titel + gleicher Tag) schon als
-- vereinsweiten Termin gibt, werden NICHT doppelt angelegt – mehrfaches
-- Ausführen ist daher ungefährlich.
-- Ab jetzt gilt: Vereinstermine werden NUR noch hier (Mitglieder-App)
-- gepflegt – die Competition-App holt sie sich über den dart-feed.
-- =====================================================================

insert into public.events (team_id, title, type, starts_at, is_public, source)
select null, t.title, 'other', t.starts_at, true, 'manual'
from (values
  ('Meldeschluss für Liga/Pokal für Mitglieder', timestamptz '2026-07-12 00:00:00 Europe/Berlin'),
  ('Sommerfest Dartabteilung',                   timestamptz '2026-07-18 00:00:00 Europe/Berlin'),
  ('Kirchweihumzug Roth',                        timestamptz '2026-08-10 00:00:00 Europe/Berlin'),
  ('Ligabeginn 26/27',                           timestamptz '2026-09-18 00:00:00 Europe/Berlin')
) as t (title, starts_at)
where not exists (
  select 1 from public.events e
  where e.team_id is null
    and e.type = 'other'
    and lower(trim(e.title)) = lower(trim(t.title))
    and (e.starts_at at time zone 'Europe/Berlin')::date
      = (t.starts_at at time zone 'Europe/Berlin')::date
);
