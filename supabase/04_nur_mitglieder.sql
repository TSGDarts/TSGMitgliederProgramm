-- =====================================================================
-- Erweiterung: Website nur für Mitglieder
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Sperrt auch den direkten Datenbank-Lesezugriff für Nicht-Eingeloggte
-- (vorher waren Mannschaften und öffentliche Termine frei lesbar,
-- weil es einen öffentlichen Bereich gab).
-- =====================================================================

drop policy if exists "teams_read_public" on public.teams;
drop policy if exists "teams_read" on public.teams;
create policy "teams_read" on public.teams
  for select using (auth.uid() is not null);

drop policy if exists "events_read" on public.events;
create policy "events_read" on public.events
  for select using (auth.uid() is not null);
