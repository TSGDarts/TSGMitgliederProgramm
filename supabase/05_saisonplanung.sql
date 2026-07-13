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
