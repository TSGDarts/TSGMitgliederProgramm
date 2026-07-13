-- =====================================================================
-- Erweiterung: Turniere im Umkreis + Competitions im Umkreis
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- Anlegen dürfen Admins und Mannschaftskapitäne/Vize-Kapitäne.
-- =====================================================================

-- Ist der aktuelle Nutzer Kapitän oder Vize irgendeiner Mannschaft?
create or replace function public.is_captain_any()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where profile_id = auth.uid() and (is_captain or is_vice_captain)
  );
$$;

-- ---------------- Turniere ----------------
create table if not exists public.tournaments (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  kind           text not null default 'frei'
                 check (kind in ('ddv', 'bdv', 'bezirk', 'frei')),
  mode           text not null default 'einzel'
                 check (mode in ('einzel', 'doppel')),
  starts_at      timestamptz not null,          -- Turnierbeginn
  entry_deadline timestamptz,                   -- Anmeldeschluss
  location       text not null default '',
  flyer_url      text not null default '',      -- hochgeladener Flyer
  register_url   text not null default '',      -- Anmeldelink
  info_url       text not null default '',      -- Link zum Turnier
  display_until  date not null,                 -- bis wann anzeigen, danach Archiv
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists tournaments_display_idx on public.tournaments (display_until);

-- ---------------- Competitions (wöchentlich) ----------------
create table if not exists public.competitions (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  weekday       int not null check (weekday between 1 and 7),  -- 1 = Montag
  mode          text not null default '',      -- z. B. "Schweizer System + KO"
  doors_time    text not null default '',      -- Einlass ab, z. B. "18:30"
  start_time    text not null default '19:00', -- Beginn
  signup_until  text not null default '',      -- Anmelden bis, z. B. "18:45"
  address       text not null default '',      -- Adresse (öffnet Karte)
  register_url  text not null default '',
  onsite_signup boolean not null default true, -- Anmeldung vor Ort möglich
  is_active     boolean not null default true, -- false = Archiv
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.tournaments  enable row level security;
alter table public.competitions enable row level security;

-- Lesen: alle eingeloggten Mitglieder
drop policy if exists "tournaments_read" on public.tournaments;
create policy "tournaments_read" on public.tournaments
  for select using (auth.uid() is not null);
drop policy if exists "competitions_read" on public.competitions;
create policy "competitions_read" on public.competitions
  for select using (auth.uid() is not null);

-- Anlegen: Admins + Kapitäne/Vize (Eintrag gehört dem Ersteller)
drop policy if exists "tournaments_insert" on public.tournaments;
create policy "tournaments_insert" on public.tournaments
  for insert with check (
    (public.is_admin() or public.is_captain_any()) and created_by = auth.uid()
  );
drop policy if exists "competitions_insert" on public.competitions;
create policy "competitions_insert" on public.competitions
  for insert with check (
    (public.is_admin() or public.is_captain_any()) and created_by = auth.uid()
  );

-- Ändern/Löschen: Admin oder Ersteller
drop policy if exists "tournaments_write" on public.tournaments;
create policy "tournaments_write" on public.tournaments
  for update using (public.is_admin() or created_by = auth.uid());
drop policy if exists "tournaments_delete" on public.tournaments;
create policy "tournaments_delete" on public.tournaments
  for delete using (public.is_admin() or created_by = auth.uid());

drop policy if exists "competitions_write" on public.competitions;
create policy "competitions_write" on public.competitions
  for update using (public.is_admin() or created_by = auth.uid());
drop policy if exists "competitions_delete" on public.competitions;
create policy "competitions_delete" on public.competitions
  for delete using (public.is_admin() or created_by = auth.uid());

-- ---------------- Speicher für Flyer (Bilder/PDFs) ----------------
insert into storage.buckets (id, name, public)
values ('flyers', 'flyers', true)
on conflict (id) do nothing;

drop policy if exists "flyers_upload" on storage.objects;
create policy "flyers_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'flyers');

drop policy if exists "flyers_delete" on storage.objects;
create policy "flyers_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'flyers' and (public.is_admin() or owner = auth.uid()));
