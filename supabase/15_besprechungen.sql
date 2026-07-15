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
