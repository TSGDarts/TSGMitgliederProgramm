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
