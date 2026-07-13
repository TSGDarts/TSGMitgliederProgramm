-- =====================================================================
-- TSG 08 Roth – Dart: Datenbank-Schema für Supabase (PostgreSQL)
-- ---------------------------------------------------------------------
-- Dieses Skript im Supabase-Dashboard unter "SQL Editor" einfügen und
-- einmalig ausführen. Es legt alle Tabellen, Rechte (Row Level Security)
-- und Hilfsfunktionen an.
-- =====================================================================

-- ---------- Profile (1:1 zu den Login-Nutzern in auth.users) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text,
  phone       text,
  role        text not null default 'player' check (role in ('admin', 'player')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------- Mannschaften ----------
create table if not exists public.teams (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  slug            text not null unique,
  description     text default '',
  league          text default '',           -- z.B. "Bezirksliga A"
  nuliga_url      text default '',            -- Link zur nuLiga-Ligaseite (Tabelle/Spielplan)
  nuliga_ical_url text default '',            -- iCal-Export-URL der Mannschaft aus nuLiga
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------- Zuordnung Person <-> Mannschaft ----------
create table if not exists public.team_members (
  team_id       uuid not null references public.teams (id) on delete cascade,
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  is_captain    boolean not null default false,
  jersey_number int,
  primary key (team_id, profile_id)
);

-- ---------- Termine (Rahmenkalender + pro Mannschaft) ----------
create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  team_id     uuid references public.teams (id) on delete cascade,  -- NULL = ganzer Verein
  title       text not null,
  description text default '',
  location    text default '',
  type        text not null default 'other'
              check (type in ('match', 'friendly', 'training', 'meeting', 'other')),
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  source      text not null default 'manual' check (source in ('manual', 'nuliga')),
  source_uid  text,                            -- eindeutige ID aus nuLiga-iCal (für Abgleich)
  is_public   boolean not null default true,   -- im öffentlichen Kalender sichtbar?
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists events_source_uid_uidx
  on public.events (source_uid) where source_uid is not null;
create index if not exists events_starts_at_idx on public.events (starts_at);

-- ---------- Zu-/Absagen (das "SpielerPlus"-Herzstück) ----------
create table if not exists public.rsvps (
  event_id    uuid not null references public.events (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  status      text not null check (status in ('yes', 'no', 'maybe')),
  comment     text default '',
  updated_at  timestamptz not null default now(),
  primary key (event_id, profile_id)
);

-- ---------- Fragen & Antworten ----------
create table if not exists public.questions (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid references public.teams (id) on delete cascade, -- NULL = vereinsweit
  author_id  uuid references public.profiles (id) on delete set null,
  title      text not null,
  body       text default '',
  created_at timestamptz not null default now()
);
create table if not exists public.answers (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Hilfsfunktionen
-- =====================================================================

-- Prüft, ob der aktuell eingeloggte Nutzer Admin ist.
-- SECURITY DEFINER umgeht RLS und verhindert damit Endlos-Rekursion.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Legt automatisch ein Profil an, sobald ein Login-Nutzer erstellt wird.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'player')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security (Zugriffsrechte)
-- =====================================================================
alter table public.profiles     enable row level security;
alter table public.teams        enable row level security;
alter table public.team_members enable row level security;
alter table public.events       enable row level security;
alter table public.rsvps        enable row level security;
alter table public.questions    enable row level security;
alter table public.answers      enable row level security;

-- ----- profiles -----
drop policy if exists "profiles_read" on public.profiles;
create policy "profiles_read" on public.profiles
  for select using (auth.uid() is not null);           -- alle eingeloggten sehen Profile

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ----- teams (öffentlich lesbar für die Public-Website) -----
drop policy if exists "teams_read_public" on public.teams;
create policy "teams_read_public" on public.teams
  for select using (true);

drop policy if exists "teams_admin_write" on public.teams;
create policy "teams_admin_write" on public.teams
  for all using (public.is_admin()) with check (public.is_admin());

-- ----- team_members (nur eingeloggt) -----
drop policy if exists "team_members_read" on public.team_members;
create policy "team_members_read" on public.team_members
  for select using (auth.uid() is not null);

drop policy if exists "team_members_admin_write" on public.team_members;
create policy "team_members_admin_write" on public.team_members
  for all using (public.is_admin()) with check (public.is_admin());

-- ----- events (öffentliche Termine ohne Login lesbar) -----
drop policy if exists "events_read" on public.events;
create policy "events_read" on public.events
  for select using (is_public = true or auth.uid() is not null);

drop policy if exists "events_admin_write" on public.events;
create policy "events_admin_write" on public.events
  for all using (public.is_admin()) with check (public.is_admin());

-- ----- rsvps (jeder pflegt seine eigene Zu-/Absage) -----
drop policy if exists "rsvps_read" on public.rsvps;
create policy "rsvps_read" on public.rsvps
  for select using (auth.uid() is not null);

drop policy if exists "rsvps_write_own" on public.rsvps;
create policy "rsvps_write_own" on public.rsvps
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ----- questions -----
drop policy if exists "questions_read" on public.questions;
create policy "questions_read" on public.questions
  for select using (auth.uid() is not null);

drop policy if exists "questions_insert" on public.questions;
create policy "questions_insert" on public.questions
  for insert with check (author_id = auth.uid());

drop policy if exists "questions_update_own_or_admin" on public.questions;
create policy "questions_update_own_or_admin" on public.questions
  for update using (author_id = auth.uid() or public.is_admin());

drop policy if exists "questions_delete_own_or_admin" on public.questions;
create policy "questions_delete_own_or_admin" on public.questions
  for delete using (author_id = auth.uid() or public.is_admin());

-- ----- answers -----
drop policy if exists "answers_read" on public.answers;
create policy "answers_read" on public.answers
  for select using (auth.uid() is not null);

drop policy if exists "answers_insert" on public.answers;
create policy "answers_insert" on public.answers
  for insert with check (author_id = auth.uid());

drop policy if exists "answers_delete_own_or_admin" on public.answers;
create policy "answers_delete_own_or_admin" on public.answers
  for delete using (author_id = auth.uid() or public.is_admin());
