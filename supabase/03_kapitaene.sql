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
