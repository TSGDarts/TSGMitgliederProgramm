-- =====================================================================
-- Competition-Termine wieder einspielen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Die beiden kommenden Montags-Competitions waren aus competition_dates
-- verschwunden – hiermit kommen sie zurück (Datum ist unique, mehrfaches
-- Ausführen ist ungefährlich). Danach liefert der dart-feed sie wieder an
-- die Competition-App, und der comp-import spiegelt sie in den
-- Terminkalender.
-- =====================================================================

insert into public.competition_dates (date, event_url, nr)
values
  ('2026-07-20', 'https://www.2k-dart-software.com/frontend/events/4/event/50736/participants', 3),
  ('2026-07-27', 'https://www.2k-dart-software.com/frontend/events/4/event/50737/participants', null)
on conflict (date) do nothing;
