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
