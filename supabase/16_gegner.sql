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
