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
