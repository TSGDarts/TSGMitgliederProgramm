-- =====================================================================
-- SAMMEL-SKRIPT: Alle Datenbank-Erweiterungen in einem Rutsch
-- ---------------------------------------------------------------------
-- Führt die Skripte 02 bis 14 zusammen aus. Kann GEFAHRLOS mehrfach
-- ausgeführt werden - bestehende Tabellen/Regeln bleiben erhalten,
-- Rahmentermine werden nur aktualisiert, nie doppelt angelegt.
-- (Voraussetzung: schema.sql wurde einmal ausgeführt.)
-- =====================================================================


-- ###################### 02_selbstanmeldung.sql ######################

-- =====================================================================
-- Erweiterung: Selbst-Anmeldung per Namensliste + Beitritts-Link/QR
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen (nach schema.sql).
-- =====================================================================

-- Allgemeine App-Einstellungen (u. a. der geheime Beitritts-Token)
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Vorab angelegte Mitglieds-Namen, die per "Ich bin das" beansprucht werden
create table if not exists public.member_invites (
  id                uuid primary key default gen_random_uuid(),
  full_name         text not null,
  role              text not null default 'player' check (role in ('admin', 'player')),
  team_ids          uuid[] not null default '{}',
  claimed           boolean not null default false,
  claimed_profile_id uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index if not exists member_invites_unclaimed_idx
  on public.member_invites (claimed) where claimed = false;

alter table public.app_settings   enable row level security;
alter table public.member_invites enable row level security;

-- Zugriff nur für Admins. Die öffentliche Selbst-Anmeldung läuft
-- serverseitig über den service_role-Schlüssel (umgeht RLS bewusst,
-- nach Prüfung des geheimen Tokens) – daher hier KEINE anon-Regeln.
drop policy if exists "app_settings_admin" on public.app_settings;
create policy "app_settings_admin" on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "member_invites_admin" on public.member_invites;
create policy "member_invites_admin" on public.member_invites
  for all using (public.is_admin()) with check (public.is_admin());

-- ###################### 03_kapitaene.sql ######################

-- =====================================================================
-- Erweiterung: Mannschaftskapitän & Vize-Kapitän + Rechte
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen (nach schema.sql).
-- =====================================================================

-- Vize-Kapitän-Kennzeichen (Kapitän gibt es schon als is_captain)
alter table public.team_members
  add column if not exists is_vice_captain boolean not null default false;

-- Darf der aktuelle Nutzer die Termine eines Teams verwalten?
-- => Admin ODER Kapitän/Vize genau dieses Teams.
create or replace function public.can_manage_team(tid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.team_members
    where profile_id = auth.uid()
      and team_id = tid
      and (is_captain or is_vice_captain)
  );
$$;

-- Termine: Admins verwalten alles; Kapitäne/Vize nur ihr eigenes Team.
drop policy if exists "events_admin_write" on public.events;
drop policy if exists "events_manage" on public.events;
create policy "events_manage" on public.events
  for all
  using (
    public.is_admin()
    or (team_id is not null and public.can_manage_team(team_id))
  )
  with check (
    public.is_admin()
    or (team_id is not null and public.can_manage_team(team_id))
  );

-- ###################### 04_nur_mitglieder.sql ######################

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

-- ###################### 05_saisonplanung.sql ######################

-- =====================================================================
-- Erweiterung: Saisonplanung (Saisons, Saisonabfrage, Team-Archiv)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Saisons
create table if not exists public.seasons (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,                 -- z. B. "Saison 2026/27"
  starts_on   date,
  ends_on     date,
  status      text not null default 'active' check (status in ('active', 'archived')),
  survey_open boolean not null default false, -- Saisonabfrage offen?
  created_at  timestamptz not null default now()
);

-- Antworten zur Saisonabfrage (eine pro Mitglied und Saison)
create table if not exists public.survey_responses (
  season_id          uuid not null references public.seasons (id) on delete cascade,
  profile_id         uuid not null references public.profiles (id) on delete cascade,
  played_last_season boolean,
  play_frequency     text not null default '',
  captain_interest   text not null default '',
  team_wishes        text not null default '',
  ambitions          text not null default '',
  sit_out            text not null default '',
  pokal_ku           text not null default '',
  pokal_8er          text not null default '',
  updated_at         timestamptz not null default now(),
  primary key (season_id, profile_id)
);

-- Archiv: Schnappschuss der Teams beim Abschließen einer Saison
create table if not exists public.season_team_archive (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references public.seasons (id) on delete cascade,
  team_name   text not null,
  league      text not null default '',
  roster      jsonb not null default '[]',   -- [{name, captain, vice}]
  stats       jsonb not null default '{}',   -- {termine, zusagen, absagen, spieler:[...]}
  archived_at timestamptz not null default now()
);

alter table public.seasons             enable row level security;
alter table public.survey_responses    enable row level security;
alter table public.season_team_archive enable row level security;

-- Saisons: alle Eingeloggten lesen, Admins schreiben
drop policy if exists "seasons_read" on public.seasons;
create policy "seasons_read" on public.seasons
  for select using (auth.uid() is not null);
drop policy if exists "seasons_admin_write" on public.seasons;
create policy "seasons_admin_write" on public.seasons
  for all using (public.is_admin()) with check (public.is_admin());

-- Antworten: jeder nur die eigene, Admins alle
drop policy if exists "survey_own" on public.survey_responses;
create policy "survey_own" on public.survey_responses
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
drop policy if exists "survey_admin" on public.survey_responses;
create policy "survey_admin" on public.survey_responses
  for all using (public.is_admin()) with check (public.is_admin());

-- Archiv: alle Eingeloggten lesen, Admins schreiben
drop policy if exists "archive_read" on public.season_team_archive;
create policy "archive_read" on public.season_team_archive
  for select using (auth.uid() is not null);
drop policy if exists "archive_admin_write" on public.season_team_archive;
create policy "archive_admin_write" on public.season_team_archive
  for all using (public.is_admin()) with check (public.is_admin());

-- ###################### 06_rahmentermine.sql ######################

-- =====================================================================
-- Rahmenterminplan 2026/27 + 2027/28 in den Gesamtkalender eintragen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen. Kann gefahrlos erneut
-- ausgeführt werden (bestehende Einträge werden aktualisiert).
-- Quelle: "Rahmenterminplan 2026-2027 / 2027-2028_Neu.pdf"
-- Jeder Eintrag steht am Montag der jeweiligen Spielwoche.
-- =====================================================================

insert into public.events
  (team_id, title, description, location, type, starts_at, source, source_uid, is_public)
values
  -- ---------------- Saison 2026/27 – Mittelfranken ----------------
  (null, '1. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 14.09. – So. 20.09.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-09-14T00:00:00+02:00', 'manual', 'rahmen:2627:kw38:spieltag1', true),
  (null, '2. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 21.09. – So. 27.09.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-09-21T00:00:00+02:00', 'manual', 'rahmen:2627:kw39:spieltag2', true),
  (null, '1. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 28.09. – So. 04.10.2026.', '', 'other', '2026-09-28T00:00:00+02:00', 'manual', 'rahmen:2627:kw40:rlt1', true),
  (null, '3. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 12.10. – So. 18.10.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-10-12T00:00:00+02:00', 'manual', 'rahmen:2627:kw42:spieltag3', true),
  (null, '4. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 19.10. – So. 25.10.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-10-19T00:00:00+02:00', 'manual', 'rahmen:2627:kw43:spieltag4', true),
  (null, '2. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 26.10. – So. 01.11.2026.', '', 'other', '2026-10-26T00:00:00+01:00', 'manual', 'rahmen:2627:kw44:rlt2', true),
  (null, '5. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 02.11. – So. 08.11.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-11-02T00:00:00+01:00', 'manual', 'rahmen:2627:kw45:spieltag5', true),
  (null, '6. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 23.11. – So. 29.11.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-11-23T00:00:00+01:00', 'manual', 'rahmen:2627:kw48:spieltag6', true),
  (null, '7. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 30.11. – So. 06.12.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-11-30T00:00:00+01:00', 'manual', 'rahmen:2627:kw49:spieltag7', true),
  (null, '8. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 07.12. – So. 13.12.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-12-07T00:00:00+01:00', 'manual', 'rahmen:2627:kw50:spieltag8', true),
  (null, '9. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 04.01. – So. 10.01.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-01-04T00:00:00+01:00', 'manual', 'rahmen:2627:kw01:spieltag9', true),
  (null, '10. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 25.01. – So. 31.01.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-01-25T00:00:00+01:00', 'manual', 'rahmen:2627:kw04:spieltag10', true),
  (null, '11. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 08.02. – So. 14.02.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-02-08T00:00:00+01:00', 'manual', 'rahmen:2627:kw06:spieltag11', true),
  (null, '3. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 15.02. – So. 21.02.2027.', '', 'other', '2027-02-15T00:00:00+01:00', 'manual', 'rahmen:2627:kw07:rlt3', true),
  (null, '12. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 22.02. – So. 28.02.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-02-22T00:00:00+01:00', 'manual', 'rahmen:2627:kw08:spieltag12', true),
  (null, '13. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 01.03. – So. 07.03.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-03-01T00:00:00+01:00', 'manual', 'rahmen:2627:kw09:spieltag13', true),
  (null, '14. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 15.03. – So. 21.03.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-03-15T00:00:00+01:00', 'manual', 'rahmen:2627:kw11:spieltag14', true),
  (null, '15. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 29.03. – So. 04.04.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-03-29T00:00:00+02:00', 'manual', 'rahmen:2627:kw13:spieltag15', true),
  (null, '16. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 12.04. – So. 18.04.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-04-12T00:00:00+02:00', 'manual', 'rahmen:2627:kw15:spieltag16', true),
  (null, '4. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 19.04. – So. 25.04.2027.', '', 'other', '2027-04-19T00:00:00+02:00', 'manual', 'rahmen:2627:kw16:rlt4', true),
  (null, '17. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 26.04. – So. 02.05.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-04-26T00:00:00+02:00', 'manual', 'rahmen:2627:kw17:spieltag17', true),
  (null, 'Pokalfinale / Final 4 – Mittelfranken', 'Rahmenterminplan: Woche Mo. 03.05. – So. 09.05.2027.', '', 'other', '2027-05-03T00:00:00+02:00', 'manual', 'rahmen:2627:kw18:pokalfinale', true),
  (null, '18. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 10.05. – So. 16.05.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-05-10T00:00:00+02:00', 'manual', 'rahmen:2627:kw19:spieltag18', true),
  (null, 'Relegation – Mittelfranken',        'Rahmenterminplan: Woche Mo. 17.05. – So. 23.05.2027.', '', 'other', '2027-05-17T00:00:00+02:00', 'manual', 'rahmen:2627:kw20:relegation', true),
  (null, 'DDV-Cup / Verbandspokal',           'Rahmenterminplan: Woche Mo. 31.05. – So. 06.06.2027.', '', 'other', '2027-05-31T00:00:00+02:00', 'manual', 'rahmen:2627:kw22:ddvcup', true),
  (null, '4er-Verbandspokal',                 'Rahmenterminplan: Woche Mo. 07.06. – So. 13.06.2027.', '', 'other', '2027-06-07T00:00:00+02:00', 'manual', 'rahmen:2627:kw23:4erpokal', true),
  (null, 'German Masters',                    'Rahmenterminplan: Woche Mo. 14.06. – So. 20.06.2027.', '', 'other', '2027-06-14T00:00:00+02:00', 'manual', 'rahmen:2627:kw24:germanmasters', true),
  (null, 'Bayrisch Masters',                  'Rahmenterminplan: Woche Mo. 21.06. – So. 27.06.2027.', '', 'other', '2027-06-21T00:00:00+02:00', 'manual', 'rahmen:2627:kw25:bayrischmasters', true),
  (null, '5. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 28.06. – So. 04.07.2027.', '', 'other', '2027-06-28T00:00:00+02:00', 'manual', 'rahmen:2627:kw26:rlt5', true),

  -- ---------------- Saison 2027/28 – Mittelfranken ----------------
  (null, '1. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 13.09. – So. 19.09.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-09-13T00:00:00+02:00', 'manual', 'rahmen:2728:kw36:spieltag1', true),
  (null, '2. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 20.09. – So. 26.09.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-09-20T00:00:00+02:00', 'manual', 'rahmen:2728:kw37:spieltag2', true),
  (null, '1. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 27.09. – So. 03.10.2027.', '', 'other', '2027-09-27T00:00:00+02:00', 'manual', 'rahmen:2728:kw38:rlt1', true),
  (null, '3. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 11.10. – So. 17.10.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-10-11T00:00:00+02:00', 'manual', 'rahmen:2728:kw40:spieltag3', true),
  (null, '4. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 18.10. – So. 24.10.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-10-18T00:00:00+02:00', 'manual', 'rahmen:2728:kw41:spieltag4', true),
  (null, '5. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 25.10. – So. 31.10.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-10-25T00:00:00+02:00', 'manual', 'rahmen:2728:kw42:spieltag5', true),
  (null, '6. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 01.11. – So. 07.11.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-11-01T00:00:00+01:00', 'manual', 'rahmen:2728:kw43:spieltag6', true),
  (null, '2. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 22.11. – So. 28.11.2027.', '', 'other', '2027-11-22T00:00:00+01:00', 'manual', 'rahmen:2728:kw46:rlt2', true),
  (null, '7. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 29.11. – So. 05.12.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-11-29T00:00:00+01:00', 'manual', 'rahmen:2728:kw47:spieltag7', true),
  (null, '8. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 06.12. – So. 12.12.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-12-06T00:00:00+01:00', 'manual', 'rahmen:2728:kw48:spieltag8', true),
  (null, '9. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 10.01. – So. 16.01.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-01-10T00:00:00+01:00', 'manual', 'rahmen:2728:kw01:spieltag9', true),
  (null, '10. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 17.01. – So. 23.01.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-01-17T00:00:00+01:00', 'manual', 'rahmen:2728:kw02:spieltag10', true),
  (null, '11. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 07.02. – So. 13.02.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-02-07T00:00:00+01:00', 'manual', 'rahmen:2728:kw05:spieltag11', true),
  (null, '12. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 14.02. – So. 20.02.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-02-14T00:00:00+01:00', 'manual', 'rahmen:2728:kw06:spieltag12', true),
  (null, '13. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 21.02. – So. 27.02.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-02-21T00:00:00+01:00', 'manual', 'rahmen:2728:kw07:spieltag13', true),
  (null, '14. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 13.03. – So. 19.03.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-03-13T00:00:00+01:00', 'manual', 'rahmen:2728:kw10:spieltag14', true),
  (null, '3. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 20.03. – So. 26.03.2028.', '', 'other', '2028-03-20T00:00:00+01:00', 'manual', 'rahmen:2728:kw11:rlt3', true),
  (null, '15. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 27.03. – So. 02.04.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-03-27T00:00:00+02:00', 'manual', 'rahmen:2728:kw12:spieltag15', true),
  (null, '16. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 24.04. – So. 30.04.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-04-24T00:00:00+02:00', 'manual', 'rahmen:2728:kw16:spieltag16', true),
  (null, '17. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 01.05. – So. 07.05.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-05-01T00:00:00+02:00', 'manual', 'rahmen:2728:kw17:spieltag17', true),
  (null, '18. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 08.05. – So. 14.05.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-05-08T00:00:00+02:00', 'manual', 'rahmen:2728:kw18:spieltag18', true),
  (null, '4. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 15.05. – So. 21.05.2028.', '', 'other', '2028-05-15T00:00:00+02:00', 'manual', 'rahmen:2728:kw19:rlt4', true),
  (null, 'Pokalfinale / Final 4 – Mittelfranken', 'Rahmenterminplan: Woche Mo. 22.05. – So. 28.05.2028.', '', 'other', '2028-05-22T00:00:00+02:00', 'manual', 'rahmen:2728:kw20:pokalfinale', true),
  (null, 'Relegation – Mittelfranken',        'Rahmenterminplan: Woche Mo. 29.05. – So. 04.06.2028.', '', 'other', '2028-05-29T00:00:00+02:00', 'manual', 'rahmen:2728:kw21:relegation', true),
  (null, 'DDV-Cup / Verbandspokal',           'Rahmenterminplan: Woche Mo. 29.05. – So. 04.06.2028.', '', 'other', '2028-05-29T00:00:00+02:00', 'manual', 'rahmen:2728:kw21:ddvcup', true),
  (null, '4er-Verbandspokal',                 'Rahmenterminplan: Woche Mo. 05.06. – So. 11.06.2028.', '', 'other', '2028-06-05T00:00:00+02:00', 'manual', 'rahmen:2728:kw22:4erpokal', true),
  (null, 'German Masters',                    'Rahmenterminplan: Woche Mo. 12.06. – So. 18.06.2028.', '', 'other', '2028-06-12T00:00:00+02:00', 'manual', 'rahmen:2728:kw23:germanmasters', true),
  (null, 'Bayrische Masters',                 'Rahmenterminplan: Woche Mo. 19.06. – So. 25.06.2028.', '', 'other', '2028-06-19T00:00:00+02:00', 'manual', 'rahmen:2728:kw24:bayrischmasters', true),
  (null, '5. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 26.06. – So. 02.07.2028.', '', 'other', '2028-06-26T00:00:00+02:00', 'manual', 'rahmen:2728:kw25:rlt5', true)

on conflict (source_uid) where source_uid is not null
do update set
  title       = excluded.title,
  description = excluded.description,
  type        = excluded.type,
  starts_at   = excluded.starts_at,
  is_public   = excluded.is_public;

-- ###################### 07_turniere_competitions.sql ######################

-- =====================================================================
-- Erweiterung: Turniere im Umkreis + Competitions im Umkreis
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Anlegen dürfen Admins und Mannschaftskapitäne/Vize-Kapitäne.
-- =====================================================================

-- Ist der aktuelle Nutzer Kapitän oder Vize irgendeiner Mannschaft?
create or replace function public.is_captain_any()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where profile_id = auth.uid() and (is_captain or is_vice_captain)
  );
$$;

-- ---------------- Turniere ----------------
create table if not exists public.tournaments (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  kind           text not null default 'frei'
                 check (kind in ('ddv', 'bdv', 'bezirk', 'frei')),
  mode           text not null default 'einzel'
                 check (mode in ('einzel', 'doppel')),
  starts_at      timestamptz not null,          -- Turnierbeginn
  entry_deadline timestamptz,                   -- Anmeldeschluss
  location       text not null default '',
  flyer_url      text not null default '',      -- hochgeladener Flyer
  register_url   text not null default '',      -- Anmeldelink
  info_url       text not null default '',      -- Link zum Turnier
  display_until  date not null,                 -- bis wann anzeigen, danach Archiv
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists tournaments_display_idx on public.tournaments (display_until);

-- ---------------- Competitions (wöchentlich) ----------------
create table if not exists public.competitions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  weekday       int not null check (weekday between 1 and 7),  -- 1 = Montag
  mode          text not null default '',      -- z. B. "Schweizer System + KO"
  doors_time    text not null default '',      -- Einlass ab, z. B. "18:30"
  start_time    text not null default '19:00', -- Beginn
  signup_until  text not null default '',      -- Anmelden bis, z. B. "18:45"
  address       text not null default '',      -- Adresse (öffnet Karte)
  register_url  text not null default '',
  onsite_signup boolean not null default true, -- Anmeldung vor Ort möglich
  is_active     boolean not null default true, -- false = Archiv
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.tournaments  enable row level security;
alter table public.competitions enable row level security;

-- Lesen: alle eingeloggten Mitglieder
drop policy if exists "tournaments_read" on public.tournaments;
create policy "tournaments_read" on public.tournaments
  for select using (auth.uid() is not null);
drop policy if exists "competitions_read" on public.competitions;
create policy "competitions_read" on public.competitions
  for select using (auth.uid() is not null);

-- Anlegen: Admins + Kapitäne/Vize (Eintrag gehört dem Ersteller)
drop policy if exists "tournaments_insert" on public.tournaments;
create policy "tournaments_insert" on public.tournaments
  for insert with check (
    (public.is_admin() or public.is_captain_any()) and created_by = auth.uid()
  );
drop policy if exists "competitions_insert" on public.competitions;
create policy "competitions_insert" on public.competitions
  for insert with check (
    (public.is_admin() or public.is_captain_any()) and created_by = auth.uid()
  );

-- Ändern/Löschen: Admin oder Ersteller
drop policy if exists "tournaments_write" on public.tournaments;
create policy "tournaments_write" on public.tournaments
  for update using (public.is_admin() or created_by = auth.uid());
drop policy if exists "tournaments_delete" on public.tournaments;
create policy "tournaments_delete" on public.tournaments
  for delete using (public.is_admin() or created_by = auth.uid());

drop policy if exists "competitions_write" on public.competitions;
create policy "competitions_write" on public.competitions
  for update using (public.is_admin() or created_by = auth.uid());
drop policy if exists "competitions_delete" on public.competitions;
create policy "competitions_delete" on public.competitions
  for delete using (public.is_admin() or created_by = auth.uid());

-- ---------------- Speicher für Flyer (Bilder/PDFs) ----------------
insert into storage.buckets (id, name, public)
values ('flyers', 'flyers', true)
on conflict (id) do nothing;

drop policy if exists "flyers_upload" on storage.objects;
create policy "flyers_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'flyers');

drop policy if exists "flyers_delete" on storage.objects;
create policy "flyers_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'flyers' and (public.is_admin() or owner = auth.uid()));

-- ###################### 08_abfrage_nachtrag.sql ######################

-- =====================================================================
-- Erweiterung: Saisonabfrage-Antworten für noch nicht registrierte
-- Namen (Selbst-Anmeldung). Beim Registrieren wandern die Antworten
-- automatisch zum neuen Mitgliedskonto.
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

create table if not exists public.survey_responses_invites (
  season_id          uuid not null references public.seasons (id) on delete cascade,
  invite_id          uuid not null references public.member_invites (id) on delete cascade,
  played_last_season boolean,
  play_frequency     text not null default '',
  captain_interest   text not null default '',
  team_wishes        text not null default '',
  ambitions          text not null default '',
  sit_out            text not null default '',
  pokal_ku           text not null default '',
  pokal_8er          text not null default '',
  updated_at         timestamptz not null default now(),
  primary key (season_id, invite_id)
);

alter table public.survey_responses_invites enable row level security;

drop policy if exists "survey_invites_admin" on public.survey_responses_invites;
create policy "survey_invites_admin" on public.survey_responses_invites
  for all using (public.is_admin()) with check (public.is_admin());

-- ###################### 09_mitglied_ohne_liga.sql ######################

-- =====================================================================
-- Erweiterung: Rolle "Mitglied (ohne Liga)"
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Fügt die dritte Rolle 'member' hinzu: Vereinsmitglied ohne
-- Liga-Spielbetrieb (nur Grundfunktionen, keine Saisonabfrage/Kader).
-- =====================================================================

alter table public.profiles
  drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'player', 'member'));

alter table public.member_invites
  drop constraint if exists member_invites_role_check;
alter table public.member_invites
  add constraint member_invites_role_check
  check (role in ('admin', 'player', 'member'));

-- ###################### 10_pokalplanung.sql ######################

-- =====================================================================
-- Erweiterung: Pokal-Planung (Klaus Unterberg Pokal + 8ter Cup)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Pro Saison zwei Pokal-Kader; zugeordnet werden registrierte
-- Mitglieder ODER vorab angelegte Namen (wandern bei Registrierung mit).
-- =====================================================================

create table if not exists public.pokal_squads (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references public.seasons (id) on delete cascade,
  kind       text not null check (kind in ('ku', '8er')),
  profile_id uuid references public.profiles (id) on delete cascade,
  invite_id  uuid references public.member_invites (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint pokal_squads_target check (
    (profile_id is not null and invite_id is null) or
    (profile_id is null and invite_id is not null)
  )
);

-- Jede Person nur einmal pro Saison und Pokal
create unique index if not exists pokal_squads_profile_uidx
  on public.pokal_squads (season_id, kind, profile_id)
  where profile_id is not null;
create unique index if not exists pokal_squads_invite_uidx
  on public.pokal_squads (season_id, kind, invite_id)
  where invite_id is not null;

alter table public.pokal_squads enable row level security;

drop policy if exists "pokal_read" on public.pokal_squads;
create policy "pokal_read" on public.pokal_squads
  for select using (auth.uid() is not null);

drop policy if exists "pokal_admin" on public.pokal_squads;
create policy "pokal_admin" on public.pokal_squads
  for all using (public.is_admin()) with check (public.is_admin());

-- ###################### 11_pokal_teams.sql ######################

-- =====================================================================
-- Erweiterung: Mehrere Pokal-Mannschaften pro Pokal
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.pokal_squads
  add column if not exists team_no int not null default 1;

alter table public.seasons
  add column if not exists pokal_ku_teams int not null default 1;
alter table public.seasons
  add column if not exists pokal_8er_teams int not null default 1;

-- ###################### 12_heimspielzeiten.sql ######################

-- =====================================================================
-- Erweiterung: Heimspielzeiten je Mannschaft (für die Mannschaftsmeldung)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.teams
  add column if not exists home_match_weekday int
  check (home_match_weekday between 1 and 7);  -- 1 = Montag … 7 = Sonntag

alter table public.teams
  add column if not exists home_match_time text not null default ''; -- z. B. "20:00"

-- ###################### 13_kapitaen_vorab.sql ######################

-- =====================================================================
-- Erweiterung: Kapitän/Vize auch für vorab angelegte Namen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Bei der Registrierung wandert die Rolle automatisch mit.
-- =====================================================================

alter table public.member_invites
  add column if not exists captain_of uuid references public.teams (id) on delete set null;

alter table public.member_invites
  add column if not exists vice_of uuid references public.teams (id) on delete set null;

-- ###################### 14_termin_art_pokal.sql ######################

-- =====================================================================
-- Erweiterung: Termin-Art "Pokalspiel"
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.events
  drop constraint if exists events_type_check;

alter table public.events
  add constraint events_type_check
  check (type in ('match', 'pokal', 'friendly', 'training', 'meeting', 'other'));
