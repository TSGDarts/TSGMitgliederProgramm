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
