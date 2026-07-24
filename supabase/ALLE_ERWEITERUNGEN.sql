-- =====================================================================
-- SAMMEL-SKRIPT: Alle Datenbank-Erweiterungen in einem Rutsch
-- ---------------------------------------------------------------------
-- Führt die Skripte 02 bis 25 zusammen aus (OHNE 06_rahmentermine -
-- die Rahmentermine wurden auf Wunsch entfernt). Kann GEFAHRLOS
-- mehrfach ausgeführt werden.
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

-- (seit Skript 43 inkl. 'fest' – muss auch hier stehen, sonst scheitert
-- ein erneuter Lauf, sobald es bereits Termine der Art „Fest“ gibt)
alter table public.events
  add constraint events_type_check
  check (type in ('match', 'pokal', 'friendly', 'training', 'meeting', 'fest', 'other'));

-- ###################### 15_besprechungen.sql ######################

-- =====================================================================
-- Erweiterung: Termine mit Einladungsliste + Online-Link (Besprechungen)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Termine MIT Einladungsliste sehen nur die Eingeladenen (und Admins);
-- Termine OHNE Einladungsliste verhalten sich wie bisher.
-- =====================================================================

-- Online-Link (Teams, Meet, Zoom, …)
alter table public.events
  add column if not exists meeting_url text not null default '';

-- Eingeladene Personen je Termin
create table if not exists public.event_invitees (
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (event_id, profile_id)
);

-- Bin ich zu diesem Termin eingeladen? (SECURITY DEFINER gegen RLS-Rekursion)
create or replace function public.is_invited(eid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_invitees
    where event_id = eid and profile_id = auth.uid()
  );
$$;

-- Ist der Termin für mich sichtbar? (keine Einladungsliste = für alle)
create or replace function public.event_visible(eid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists (select 1 from public.event_invitees where event_id = eid)
      or exists (
        select 1 from public.event_invitees
        where event_id = eid and profile_id = auth.uid()
      );
$$;

alter table public.event_invitees enable row level security;

drop policy if exists "invitees_read" on public.event_invitees;
create policy "invitees_read" on public.event_invitees
  for select using (
    auth.uid() is not null
    and (public.is_admin() or public.is_invited(event_id))
  );

drop policy if exists "invitees_admin" on public.event_invitees;
create policy "invitees_admin" on public.event_invitees
  for all using (public.is_admin()) with check (public.is_admin());

-- Termine: nur sichtbare lesen (Admins sehen alles)
drop policy if exists "events_read" on public.events;
create policy "events_read" on public.events
  for select using (
    auth.uid() is not null
    and (public.is_admin() or public.event_visible(id))
  );

-- ###################### 16_gegner.sql ######################

-- =====================================================================
-- Erweiterung: Gegner-Verwaltung (Vereine mit Adresse) + Heim/Auswärts
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Gegnervereine (Adresse einmalig hinterlegen)
create table if not exists public.opponents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,              -- z. B. "DC Schwabach"
  address    text not null default '',
  notes      text not null default '',
  created_at timestamptz not null default now()
);

alter table public.opponents enable row level security;

drop policy if exists "opponents_read" on public.opponents;
create policy "opponents_read" on public.opponents
  for select using (auth.uid() is not null);

drop policy if exists "opponents_write" on public.opponents;
create policy "opponents_write" on public.opponents
  for all
  using (public.is_admin() or public.is_captain_any())
  with check (public.is_admin() or public.is_captain_any());

-- Termine: Gegner, dessen Mannschafts-Nr. und Heim/Auswärts
alter table public.events
  add column if not exists opponent_id uuid references public.opponents (id) on delete set null;
alter table public.events
  add column if not exists opponent_team_no int;
alter table public.events
  add column if not exists home_away text not null default ''
  check (home_away in ('', 'heim', 'auswaerts'));

-- ###################### 17_dart_feed.sql ######################

-- =====================================================================
-- Erweiterung: Dart-Feed (/api/dart-feed) + Startdaten-Import
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen (mehrfach ist gefahrlos –
-- vorhandene Einträge werden nicht doppelt angelegt).
-- =====================================================================

-- Konkrete Termine unserer eigenen Competition (für den Feed)
create table if not exists public.competition_dates (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique,
  event_url  text not null default '',
  nr         int,
  created_at timestamptz not null default now()
);

alter table public.competition_dates enable row level security;

drop policy if exists "competition_dates_read" on public.competition_dates;
create policy "competition_dates_read" on public.competition_dates
  for select using (auth.uid() is not null);

drop policy if exists "competition_dates_write" on public.competition_dates;
create policy "competition_dates_write" on public.competition_dates
  for all
  using (public.is_admin() or public.is_captain_any())
  with check (public.is_admin() or public.is_captain_any());

-- Turniere: Einlass-Uhrzeit
alter table public.tournaments
  add column if not exists doors_time text not null default '';

-- ---------------- Startbestand aus mitglieder-feed-start.json ----------------
-- HIER BEWUSST ENTFERNT: Der Einmal-Import (2 Competition-Termine +
-- 5 Turniere) hat gelöschte oder umdatierte Einträge bei jedem Lauf
-- wieder neu angelegt (Abgleich war Titel+Datum). Er lief am 2026-07-15
-- einmalig und wird nicht mehr gebraucht.

-- ###################### 18_details.sql ######################

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

-- ###################### 19_standard_rueckmeldung.sql ######################

-- =====================================================================
-- Erweiterung: Standard-Rückmeldung pro Mannschaft
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- '' = keine Vorbelegung, 'yes'/'no'/'maybe' = alle starten mit diesem
-- Status (der Grund-Text für Absagen nutzt die vorhandene Spalte
-- rsvps.comment).
-- =====================================================================

alter table public.teams
  add column if not exists default_rsvp text not null default ''
  check (default_rsvp in ('', 'yes', 'no', 'maybe'));

-- ###################### 20_geburtstage_boards.sql ######################

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

-- ###################### 21_competition_modi.sql ######################

-- =====================================================================
-- Erweiterung: Modus-Vorlagen + Flyer für Competitions
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Flyer bei wöchentlichen Competitions
alter table public.competitions
  add column if not exists flyer_url text not null default '';

-- "Unsere Competition-Termine" werden im DartCompetitionProgramm gepflegt,
-- nicht mehr hier – vorhandene Einträge entfernen (Feed liefert dann eine
-- leere Liste für kommendeCompetitions).
delete from public.competition_dates;

-- Gespeicherte Modus-Vorlagen (auswählbar, erweiterbar)
create table if not exists public.competition_modes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  created_at timestamptz not null default now()
);

alter table public.competition_modes enable row level security;

drop policy if exists "modes_read" on public.competition_modes;
create policy "modes_read" on public.competition_modes
  for select using (auth.uid() is not null);

drop policy if exists "modes_write" on public.competition_modes;
create policy "modes_write" on public.competition_modes
  for all
  using (public.is_admin() or public.is_captain_any())
  with check (public.is_admin() or public.is_captain_any());

-- Startbestand an Vorlagen
insert into public.competition_modes (name)
values
  ('Schweizer System + KO'),
  ('Doppel-KO'),
  ('Nur Gruppenphase (jeder gegen jeden)'),
  ('Gruppenphase (nach Setzliste)')
on conflict (name) do nothing;

-- ###################### 22_gegner_boards.sql ######################

-- =====================================================================
-- Erweiterung: Board-Anzahl bei Gegnern
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.opponents
  add column if not exists boards int;

-- ###################### 23_invite_geburtstag.sql ######################

-- =====================================================================
-- Erweiterung: Geburtstag bei vorab angelegten Namen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.member_invites
  add column if not exists birthday date;
alter table public.member_invites
  add column if not exists birthday_public boolean not null default false;

-- ###################### 24_termine_einmalimport.sql ######################

-- Einmal-Import der vier Start-Vereinstermine: HIER BEWUSST ENTFERNT.
-- Er hat die Termine bei jedem Lauf NEU angelegt, sobald das Original
-- bearbeitet worden war (z. B. Art auf „Fest“ umgestellt, Datum/Titel
-- geändert oder gelöscht) – dadurch tauchten plötzlich doppelte
-- Vereinstermine auf. Der Import lief am 2026-07-15 einmalig und wird
-- nicht mehr gebraucht (Original: supabase/24_termine_einmalimport.sql).

-- ###################### 24_uhrzeit_folgt.sql ######################

-- =====================================================================
-- Erweiterung: "Genaue Uhrzeit folgt noch" bei Terminen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.events
  add column if not exists time_tbd boolean not null default false;

-- ###################### 25_termin_archiv.sql ######################

-- =====================================================================
-- Erweiterung: Automatisches Termin-Archiv (einstellbare Frist)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Mitglieder dürfen die App-Einstellungen lesen (z. B. die Archiv-Frist).
drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings
  for select using (auth.uid() is not null);

-- Standard: Termine 30 Tage nach ihrem Datum archivieren
insert into public.app_settings (key, value)
values ('event_archive_days', '30')
on conflict (key) do nothing;

-- ###################### 26_feed_uebergabe.sql ######################

-- =====================================================================
-- Erweiterung: Übergabe an die Competition-App pro Termin steuerbar
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Steuert, ob ein Termin im öffentlichen Dart-Feed (und damit in der
-- Competition-App) erscheint. Standard: ja – wie bisher.
alter table public.events
  add column if not exists feed_export boolean not null default true;

-- ###################### 27_gratulation.sql ######################

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

-- ###################### 28_bearbeiter_rolle.sql ######################

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


-- ###################### 29_turnier_zeitraum.sql ######################

-- =====================================================================
-- Erweiterung: Turniere mit Zeitraum + "Details folgen"
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Optionales Turnierende (für mehrtägige Turniere, z. B. ein Wochenende)
alter table public.tournaments
  add column if not exists ends_at timestamptz;

-- "Noch keine Details verfügbar" – Anzeige "Details folgen"
alter table public.tournaments
  add column if not exists details_tbd boolean not null default false;


-- ###################### 31_trainer.sql ######################

-- =====================================================================
-- Erweiterung: Trainer-Kennzeichen + Trainings eintragen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen (setzt Skript 28 voraus,
-- das in ALLE_ERWEITERUNGEN.sql enthalten ist).
-- =====================================================================

-- Trainer-Haken am Mitglied (zusätzlich zur Rolle, vergibt der Admin)
alter table public.profiles
  add column if not exists is_trainer boolean not null default false;

-- Darf der aktuelle Nutzer Trainings verwalten?
-- => Trainer-Haken ODER Admin/Bearbeiter.
create or replace function public.is_trainer()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and (is_trainer or role in ('admin', 'editor'))
      and is_active
  );
$$;

-- Termine: Trainer dürfen zusätzlich Trainings anlegen/bearbeiten/löschen
drop policy if exists "events_manage" on public.events;
create policy "events_manage" on public.events
  for all
  using (
    public.is_editor()
    or (team_id is not null and public.can_manage_team(team_id))
    or (type = 'training' and public.is_trainer())
  )
  with check (
    public.is_editor()
    or (team_id is not null and public.can_manage_team(team_id))
    or (type = 'training' and public.is_trainer())
  );


-- ###################### 32_training_details.sql ######################

-- =====================================================================
-- Erweiterung: Standard-Antwort für Trainings + anwesende Trainer
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Persönliche Vorbelegung für Trainings (stellt jeder im Profil ein):
-- '' = keine, sonst yes/maybe/no – gilt, solange keine eigene Antwort da ist.
alter table public.profiles
  add column if not exists training_default_rsvp text not null default ''
  check (training_default_rsvp in ('', 'yes', 'maybe', 'no'));

-- Welche Trainer bei einem Training anwesend sind (mehrere möglich)
alter table public.events
  add column if not exists trainer_ids uuid[] not null default '{}';


-- ###################### 33_trainer_vorab.sql ######################

-- =====================================================================
-- Erweiterung: Trainer-Haken auch für vorab angelegte Namen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Vorbelegung durch den Admin; bei der Registrierung wandert der Haken
-- automatisch mit ins Profil.
alter table public.member_invites
  add column if not exists is_trainer boolean not null default false;


-- ###################### 34_turnier_kommentar.sql ######################

-- =====================================================================
-- Erweiterung: Kommentar-Feld für Turniere
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.tournaments
  add column if not exists notes text not null default '';


-- ###################### 35_termin_ansprechpartner.sql ######################

-- =====================================================================
-- Erweiterung: Ansprechpartner an Terminen (mehrere möglich)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.events
  add column if not exists contact_ids uuid[] not null default '{}';


-- ###################### 36_benachrichtigungen.sql ######################

-- =====================================================================
-- Erweiterung: Benachrichtigungen (Push + E-Mail)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Push-Abos: ein Eintrag pro Gerät, das Push aktiviert hat
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Einstellungen am Profil
alter table public.profiles
  add column if not exists notify_email boolean not null default false;
alter table public.profiles
  add column if not exists notify_turnier_woche boolean not null default false;

-- Merkliste bereits verschickter Erinnerungen (verhindert Doppel-Versand;
-- nur der Server schreibt hier – kein Zugriff für normale Logins)
create table if not exists public.notification_log (
  key     text primary key,
  sent_at timestamptz not null default now()
);

alter table public.notification_log enable row level security;


-- ###################### 37_spieltag.sql ######################

-- =====================================================================
-- Erweiterung: Fahrgemeinschaften + Aufstellung + Gegner-Ansprechpartner
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen (setzt Skript 28 voraus,
-- das in ALLE_ERWEITERUNGEN.sql enthalten ist).
-- =====================================================================

-- 1) Fahrgemeinschaften: jeder pflegt seinen eigenen Eintrag pro Termin
create table if not exists public.event_carpool (
  event_id   uuid not null references public.events (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role       text not null check (role in ('fahrer', 'mitfahrer')),
  seats      int check (seats between 1 and 8),
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);

alter table public.event_carpool enable row level security;

drop policy if exists "carpool_read" on public.event_carpool;
create policy "carpool_read" on public.event_carpool
  for select using (auth.uid() is not null);

drop policy if exists "carpool_own" on public.event_carpool;
create policy "carpool_own" on public.event_carpool
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- 2) Aufstellung: Entwurf nur für Kapitän/Bearbeiter sichtbar,
--    nach der Freigabe für alle Eingeloggten
create table if not exists public.event_lineups (
  event_id   uuid primary key references public.events (id) on delete cascade,
  entries    jsonb not null default '[]'::jsonb,
  released   boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.event_lineups enable row level security;

drop policy if exists "lineup_read" on public.event_lineups;
create policy "lineup_read" on public.event_lineups
  for select using (
    auth.uid() is not null
    and (
      released
      or public.is_editor()
      or exists (
        select 1 from public.events e
        where e.id = event_id
          and e.team_id is not null
          and public.can_manage_team(e.team_id)
      )
    )
  );

drop policy if exists "lineup_write" on public.event_lineups;
create policy "lineup_write" on public.event_lineups
  for all
  using (
    public.is_editor()
    or exists (
      select 1 from public.events e
      where e.id = event_id
        and e.team_id is not null
        and public.can_manage_team(e.team_id)
    )
  )
  with check (
    public.is_editor()
    or exists (
      select 1 from public.events e
      where e.id = event_id
        and e.team_id is not null
        and public.can_manage_team(e.team_id)
    )
  );

-- 3) Ansprechpartner des Gegners (für die Heimspiel-Nachricht)
alter table public.opponents
  add column if not exists contact_name text not null default '';


-- ###################### 38_modus_erinnerung.sql ######################

-- =====================================================================
-- Erweiterung: Spielmodus je Mannschaft + Turnier-Erinnerung in Tagen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Liga-Spielmodus pro Mannschaft (Teams spielen in unterschiedlichen Ligen)
alter table public.teams
  add column if not exists spielmodus text not null default '';

-- Turnier-Erinnerung: frei wählbare Anzahl Tage vorher (0 = aus)
alter table public.profiles
  add column if not exists notify_turnier_tage int not null default 0
  check (notify_turnier_tage between 0 and 30);

-- Bisherige „1 Woche vorher“-Abonnenten übernehmen
update public.profiles
set notify_turnier_tage = 7
where notify_turnier_woche and notify_turnier_tage = 0;


-- ###################### 39_erinnerungen.sql ######################

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


-- ###################### 40_erinnerung_standard.sql ######################

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


-- ###################### 41_erinnerung_trotz_absage.sql ######################

-- =====================================================================
-- Erweiterung: Erinnerung auch nach Absage (pro Mitglied wählbar)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.profiles
  add column if not exists notify_trotz_absage boolean not null default false;


-- ###################### 42_sichere_einstellungen.sql ######################

-- =====================================================================
-- Erweiterung: Geschützte Einstellungen (z. B. E-Mail-Zugangsdaten)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Im Gegensatz zu app_settings können diese Werte NICHT von Mitgliedern
-- gelesen werden: RLS ist an, aber es gibt keine Lese-Richtlinie –
-- nur der Server (Service-Rolle) kommt heran.
create table if not exists public.secure_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.secure_settings enable row level security;


-- ============================================================
-- 43: Neue Termin-Art „Fest“ + Erinnerungs-Haken je eigener Antwort
-- ============================================================

alter table events
  drop constraint if exists events_type_check;
alter table events
  add constraint events_type_check
  check (type in ('match', 'pokal', 'friendly', 'training', 'meeting', 'fest', 'other'));

alter table profiles
  add column if not exists notify_trotz_zusage boolean not null default true;
alter table profiles
  add column if not exists notify_trotz_vielleicht boolean not null default true;

-- ============================================================
-- 44: Fragen & Feedback – Beitrags-Art (Frage/Lob/Kritik/Idee/Problem)
-- ============================================================

alter table questions
  add column if not exists kind text not null default 'frage';

alter table questions
  drop constraint if exists questions_kind_check;
alter table questions
  add constraint questions_kind_check
  check (kind in ('frage', 'lob', 'kritik', 'idee', 'problem'));

-- ============================================================
-- 45: Saisonplaner – Berechtigung + eigene Planungs-Entwürfe
-- ============================================================

alter table profiles
  add column if not exists is_planner boolean not null default false;
alter table member_invites
  add column if not exists is_planner boolean not null default false;

create table if not exists season_plans (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  notes text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (season_id, owner_id)
);
alter table season_plans enable row level security;

-- ============================================================
-- 46: Pokal-Kapitän je Pokal-Team
-- ============================================================

alter table pokal_squads
  add column if not exists is_captain boolean not null default false;

-- ============================================================
-- 47: 2k-Link je Spieltermin (für Gegner-Nachricht + Live-Verfolgen)
-- ============================================================

alter table events
  add column if not exists match_url text not null default '';

-- ============================================================
-- 48: Standard: Erinnerungen 14+7+3 bei allen Arten, E-Mail an
-- (individuell angepasste Profile bleiben unangetastet)
-- ============================================================

alter table public.profiles
  alter column notify_erinnerungen set default
  '{"punktspiele":[14,7,3],"pokal":[14,7,3],"freundschaft":[14,7,3],"training":[14,7,3],"feste":[14,7,3],"verein":[14,7,3],"turniere":[14,7,3]}'::jsonb;

alter table public.profiles
  alter column notify_email set default true;

update public.profiles
set notify_erinnerungen =
  '{"punktspiele":[14,7,3],"pokal":[14,7,3],"freundschaft":[14,7,3],"training":[14,7,3],"feste":[14,7,3],"verein":[14,7,3],"turniere":[14,7,3]}'::jsonb,
  notify_email = true
where notify_erinnerungen = '{}'::jsonb
   or notify_erinnerungen = '{"turniere": [7]}'::jsonb
   or notify_erinnerungen = '{"punktspiele":[7,3],"pokal":[7,3],"freundschaft":[7,3],"training":[7,3],"verein":[7,3],"turniere":[7,3]}'::jsonb;

-- ============================================================
-- 49: Mitglieder-Austritt (Austrittsdatum, automatische Deaktivierung)
-- ============================================================

alter table profiles
  add column if not exists left_on date;

-- ============================================================
-- 50: Austrittsdatum auch für vorab angelegte Namen
-- ============================================================

alter table member_invites
  add column if not exists left_on date;

-- ============================================================
-- 51: Endergebnis am Spieltermin (z. B. "8:10")
-- ============================================================

alter table events
  add column if not exists result text not null default '';

-- ============================================================
-- 52: Spielbericht (Einzel/Doppel je Spieltag) aus nuLiga
-- ============================================================

alter table events
  add column if not exists match_stats jsonb;

-- ============================================================
-- 53: Schwarzes Brett (Ankündigungen) + Umfragen
-- ============================================================


create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null default '',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table announcements enable row level security;
drop policy if exists "announcements_read" on announcements;
create policy "announcements_read" on announcements
  for select using (auth.uid() is not null);
drop policy if exists "announcements_write" on announcements;
create policy "announcements_write" on announcements
  for all
  using (public.is_admin() or public.is_editor())
  with check (public.is_admin() or public.is_editor());

create table if not exists polls (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  options    text[] not null default '{}',
  multi      boolean not null default false,
  open       boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table polls enable row level security;
drop policy if exists "polls_read" on polls;
create policy "polls_read" on polls
  for select using (auth.uid() is not null);
drop policy if exists "polls_write" on polls;
create policy "polls_write" on polls
  for all
  using (public.is_admin() or public.is_editor())
  with check (public.is_admin() or public.is_editor());

create table if not exists poll_votes (
  poll_id      uuid not null references polls (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  option_index int not null,
  created_at   timestamptz not null default now(),
  primary key (poll_id, profile_id, option_index)
);
alter table poll_votes enable row level security;
drop policy if exists "poll_votes_read" on poll_votes;
create policy "poll_votes_read" on poll_votes
  for select using (auth.uid() is not null);
drop policy if exists "poll_votes_insert" on poll_votes;
create policy "poll_votes_insert" on poll_votes
  for insert with check (profile_id = auth.uid());
drop policy if exists "poll_votes_delete" on poll_votes;
create policy "poll_votes_delete" on poll_votes
  for delete using (profile_id = auth.uid());

-- ============================================================
-- 54: Helferliste bei Heimspielen
-- ============================================================

-- 54: Helferliste bei Heimspielen (Theke, Aufbau, Essen …).
-- Jeder pflegt nur seinen eigenen Eintrag. Mehrfach ausführbar (idempotent).

create table if not exists event_helpers (
  event_id   uuid not null references events (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  aufgabe    text not null default '',
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
alter table event_helpers enable row level security;
drop policy if exists "event_helpers_read" on event_helpers;
create policy "event_helpers_read" on event_helpers
  for select using (auth.uid() is not null);
drop policy if exists "event_helpers_write" on event_helpers;
create policy "event_helpers_write" on event_helpers
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ============================================================
-- 55: Doppelte Competitions aufraeumen
-- ============================================================

-- 55: Doppelte Competitions aufräumen (identischer Name + Wochentag +
-- Adresse, z. B. durch doppeltes Absenden des Formulars entstanden).
-- Es bleibt jeweils der älteste Eintrag stehen. Mehrfach ausführbar.

delete from competitions c
using competitions d
where c.title = d.title
  and c.weekday = d.weekday
  and c.address = d.address
  and (
    d.created_at < c.created_at
    or (d.created_at = c.created_at and d.id < c.id)
  );

-- ============================================================
-- 56: Kassenbuch (Berechtigung, Import, Belege, Auslagen)
-- ============================================================

-- 56: Kassenbuch der Dart-Abteilung.
-- Neue Berechtigung „Kassierer" + Tabellen für Kontostand-Importe (Excel
-- vom Hauptverein), Belege/Rechnungen und Auszahlungsanträge der
-- Mitglieder. Alle Tabellen: RLS AN, KEINE Policies → nur der
-- Service-Schlüssel (Server) kommt ran; die Berechtigung prüft der Code.
-- Mehrfach ausführbar (idempotent).

-- Berechtigung „Kassierer" (wie is_trainer / is_planner)
alter table profiles      add column if not exists is_treasurer boolean not null default false;
alter table member_invites add column if not exists is_treasurer boolean not null default false;

-- Monatliche Kontostand-Auswertung (Import der Hauptvereins-Excel)
create table if not exists kasse_import (
  id         uuid primary key default gen_random_uuid(),
  stichtag   date,
  dateiname  text not null default '',
  file_path  text not null default '',   -- Ablage der Original-Datei (Storage)
  einnahmen  numeric(12,2),
  ausgaben   numeric(12,2),
  saldo      numeric(12,2),
  is_current boolean not null default false,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table kasse_import enable row level security;

-- Einzelbuchungen einer Auswertung
create table if not exists kasse_buchung (
  id         uuid primary key default gen_random_uuid(),
  import_id  uuid not null references kasse_import (id) on delete cascade,
  datum      date,
  empfaenger text not null default '',
  betrag     numeric(12,2),
  kategorie  text not null default '',
  konto      text not null default '',
  zweck      text not null default ''
);
alter table kasse_buchung enable row level security;
create index if not exists kasse_buchung_import_idx on kasse_buchung (import_id);

-- Belege/Rechnungen (3k, BDV, Spized …), vom Kassierer abgelegt
create table if not exists kasse_beleg (
  id         uuid primary key default gen_random_uuid(),
  titel      text not null default '',
  empfaenger text not null default '',
  betrag     numeric(12,2),
  datum      date,
  kategorie  text not null default '',
  file_path  text not null default '',
  dateiname  text not null default '',
  note       text not null default '',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table kasse_beleg enable row level security;

-- Auszahlungsanträge der Mitglieder (Auslagen-Erstattung)
create table if not exists kasse_auslage (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  titel          text not null default '',
  betrag         numeric(12,2),
  datum          date,
  zweck          text not null default '',
  iban           text not null default '',
  file_path      text not null default '',
  dateiname      text not null default '',
  status         text not null default 'eingereicht'
                 check (status in ('eingereicht','genehmigt','abgelehnt','ausgezahlt')),
  bearbeiter_id  uuid references profiles (id) on delete set null,
  bearbeiter_note text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table kasse_auslage enable row level security;
create index if not exists kasse_auslage_profile_idx on kasse_auslage (profile_id);
create index if not exists kasse_auslage_status_idx on kasse_auslage (status);

-- Privater Storage-Bucket für Kassen-Dateien (Belege, Auswertungen, Fotos)
insert into storage.buckets (id, name, public)
values ('kasse', 'kasse', false)
on conflict (id) do nothing;

-- Hochladen dürfen angemeldete Nutzer (Beleg-Fotos für Auslagen);
-- Ansehen/Download läuft ausschließlich über serverseitig erzeugte
-- Signed-URLs (Service-Schlüssel) nach Berechtigungsprüfung – daher
-- KEINE Lese-Policy.
drop policy if exists "kasse_upload" on storage.objects;
create policy "kasse_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kasse');

drop policy if exists "kasse_delete" on storage.objects;
create policy "kasse_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kasse' and (public.is_admin() or owner = auth.uid()));
