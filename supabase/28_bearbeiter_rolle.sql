-- =====================================================================
-- Erweiterung: Rolle "Bearbeiter"
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Bearbeiter dürfen Termine (aller Mannschaften), Gegner, Mannschaften,
-- Turniere und Competitions verwalten – aber KEINE Mitglieder, Rollen
-- oder die Selbst-Anmeldung (das bleibt dem Admin vorbehalten).
-- =====================================================================

-- 1) Rolle 'editor' zulassen
alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'editor', 'player', 'member'));

alter table public.member_invites
  drop constraint if exists member_invites_role_check;
alter table public.member_invites
  add constraint member_invites_role_check
  check (role in ('admin', 'editor', 'player', 'member'));

-- 2) Prüft: Admin ODER Bearbeiter (für Inhalte-Verwaltung)
create or replace function public.is_editor()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'editor') and is_active
  );
$$;

-- 3) Termine: Bearbeiter wie Admin (alle Mannschaften), Kapitäne wie gehabt
drop policy if exists "events_manage" on public.events;
create policy "events_manage" on public.events
  for all
  using (
    public.is_editor()
    or (team_id is not null and public.can_manage_team(team_id))
  )
  with check (
    public.is_editor()
    or (team_id is not null and public.can_manage_team(team_id))
  );

-- Bearbeiter sehen alle Termine (auch mit Einladungsliste) und pflegen
-- die Einladungslisten
drop policy if exists "events_read" on public.events;
create policy "events_read" on public.events
  for select using (
    auth.uid() is not null
    and (public.is_editor() or public.event_visible(id))
  );

drop policy if exists "invitees_read" on public.event_invitees;
create policy "invitees_read" on public.event_invitees
  for select using (
    auth.uid() is not null
    and (public.is_editor() or public.is_invited(event_id))
  );

drop policy if exists "invitees_admin" on public.event_invitees;
create policy "invitees_admin" on public.event_invitees
  for all using (public.is_editor()) with check (public.is_editor());

-- 4) Mannschaften + Kader
drop policy if exists "teams_admin_write" on public.teams;
create policy "teams_admin_write" on public.teams
  for all using (public.is_editor()) with check (public.is_editor());

drop policy if exists "team_members_admin_write" on public.team_members;
create policy "team_members_admin_write" on public.team_members
  for all using (public.is_editor()) with check (public.is_editor());

-- 5) Gegner
drop policy if exists "opponents_write" on public.opponents;
create policy "opponents_write" on public.opponents
  for all
  using (public.is_editor() or public.is_captain_any())
  with check (public.is_editor() or public.is_captain_any());

-- 6) Einstellungen (Archiv-Frist, Heimadresse etc.)
drop policy if exists "app_settings_admin" on public.app_settings;
create policy "app_settings_admin" on public.app_settings
  for all using (public.is_editor()) with check (public.is_editor());

-- 7) Turniere & Competitions: Bearbeiter dürfen alles bearbeiten/löschen
drop policy if exists "tournaments_insert" on public.tournaments;
create policy "tournaments_insert" on public.tournaments
  for insert with check (
    (public.is_editor() or public.is_captain_any()) and created_by = auth.uid()
  );

drop policy if exists "tournaments_write" on public.tournaments;
create policy "tournaments_write" on public.tournaments
  for update using (public.is_editor() or created_by = auth.uid());

drop policy if exists "tournaments_delete" on public.tournaments;
create policy "tournaments_delete" on public.tournaments
  for delete using (public.is_editor() or created_by = auth.uid());

drop policy if exists "competitions_insert" on public.competitions;
create policy "competitions_insert" on public.competitions
  for insert with check (
    (public.is_editor() or public.is_captain_any()) and created_by = auth.uid()
  );

drop policy if exists "competitions_write" on public.competitions;
create policy "competitions_write" on public.competitions
  for update using (public.is_editor() or created_by = auth.uid());

drop policy if exists "competitions_delete" on public.competitions;
create policy "competitions_delete" on public.competitions
  for delete using (public.is_editor() or created_by = auth.uid());

drop policy if exists "competition_dates_write" on public.competition_dates;
create policy "competition_dates_write" on public.competition_dates
  for all
  using (public.is_editor() or public.is_captain_any())
  with check (public.is_editor() or public.is_captain_any());

drop policy if exists "modes_write" on public.competition_modes;
create policy "modes_write" on public.competition_modes
  for all
  using (public.is_editor() or public.is_captain_any())
  with check (public.is_editor() or public.is_captain_any());
