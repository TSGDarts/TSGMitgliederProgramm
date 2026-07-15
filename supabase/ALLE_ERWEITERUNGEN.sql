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

alter table public.events
  add constraint events_type_check
  check (type in ('match', 'pokal', 'friendly', 'training', 'meeting', 'other'));

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

insert into public.competition_dates (date, event_url, nr)
select v.d::date, v.u, v.n::int
from (values
  ('2026-07-20', 'https://www.2k-dart-software.com/frontend/events/4/event/50736/participants', 3),
  ('2026-07-27', 'https://www.2k-dart-software.com/frontend/events/4/event/50737/participants', null)
) as v(d, u, n)
where not exists (
  select 1 from public.competition_dates c where c.date = v.d::date
);

insert into public.tournaments
  (title, kind, mode, starts_at, entry_deadline, doors_time, location,
   flyer_url, register_url, info_url, display_until)
select v.title, v.kind, v.mode, v.starts_at::timestamptz,
       nullif(v.deadline, '')::timestamptz, v.doors, '', '',
       v.reg, v.info, v.starts_at::date
from (values
  ('Sommerturnier NesselbacherSchbiggerSyndikat', 'frei', 'einzel',
   '2026-07-25T10:00:00+02:00', '', '',
   'https://www.darthelfer.de/public/tournament/515a986b-531c-4e7c-8d67-557b3d432303',
   'https://www.darthelfer.de/public/tournament/515a986b-531c-4e7c-8d67-557b3d432303'),
  ('11. Kleinloher Steeldarts Open', 'frei', 'einzel',
   '2026-08-01T13:00:00+02:00', '2026-07-31T23:59:00+02:00', '12:00',
   'https://www.2k-dart-software.com/frontend/events/1/registration/237/register',
   'https://www.2k-dart-software.com/frontend/events/1/event/35148/participants'),
  ('Rothsee Dart Masters Allersberg', 'frei', 'einzel',
   '2026-08-02T10:00:00+02:00', '', '', '', ''),
  ('Doppel Rothsee Dart Masters Allersberg', 'frei', 'doppel',
   '2026-08-01T12:00:00+02:00', '', '', '', ''),
  ('2. Golden Arrows Einzelturnier Schwabach', 'frei', 'einzel',
   '2026-08-29T10:00:00+02:00', '', '09:00',
   'https://2k-dart-software.com/frontend/events/2/registration/697/register',
   'https://2k-dart-software.com/frontend/events/2/event/33348/participants')
) as v(title, kind, mode, starts_at, deadline, doors, reg, info)
where not exists (
  select 1 from public.tournaments t
  where t.title = v.title
    and t.starts_at::date = v.starts_at::timestamptz::date
);

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

