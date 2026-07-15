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
