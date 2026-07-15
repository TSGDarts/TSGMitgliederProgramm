-- =====================================================================
-- Erweiterung: Dart-Feed (/api/dart-feed) + Startdaten-Import
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen (mehrfach ist gefahrlos –
-- vorhandene Einträge werden nicht doppelt angelegt).
-- =====================================================================

-- Konkrete Termine unserer eigenen Competition (für den Feed)
create table if not exists public.competition_dates (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique,
  event_url  text not null default '',
  nr         int,
  created_at timestamptz not null default now()
);

alter table public.competition_dates enable row level security;

drop policy if exists "competition_dates_read" on public.competition_dates;
create policy "competition_dates_read" on public.competition_dates
  for select using (auth.uid() is not null);

drop policy if exists "competition_dates_write" on public.competition_dates;
create policy "competition_dates_write" on public.competition_dates
  for all
  using (public.is_admin() or public.is_captain_any())
  with check (public.is_admin() or public.is_captain_any());

-- Turniere: Einlass-Uhrzeit
alter table public.tournaments
  add column if not exists doors_time text not null default '';

-- ---------------- Startbestand aus mitglieder-feed-start.json ----------------

insert into public.competition_dates (date, event_url, nr)
select v.d::date, v.u, v.n::int
from (values
  ('2026-07-20', 'https://www.2k-dart-software.com/frontend/events/4/event/50736/participants', 3),
  ('2026-07-27', 'https://www.2k-dart-software.com/frontend/events/4/event/50737/participants', null)
) as v(d, u, n)
where not exists (
  select 1 from public.competition_dates c where c.date = v.d::date
);

insert into public.tournaments
  (title, kind, mode, starts_at, entry_deadline, doors_time, location,
   flyer_url, register_url, info_url, display_until)
select v.title, v.kind, v.mode, v.starts_at::timestamptz,
       nullif(v.deadline, '')::timestamptz, v.doors, '', '',
       v.reg, v.info, v.starts_at::date
from (values
  ('Sommerturnier NesselbacherSchbiggerSyndikat', 'frei', 'einzel',
   '2026-07-25T10:00:00+02:00', '', '',
   'https://www.darthelfer.de/public/tournament/515a986b-531c-4e7c-8d67-557b3d432303',
   'https://www.darthelfer.de/public/tournament/515a986b-531c-4e7c-8d67-557b3d432303'),
  ('11. Kleinloher Steeldarts Open', 'frei', 'einzel',
   '2026-08-01T13:00:00+02:00', '2026-07-31T23:59:00+02:00', '12:00',
   'https://www.2k-dart-software.com/frontend/events/1/registration/237/register',
   'https://www.2k-dart-software.com/frontend/events/1/event/35148/participants'),
  ('Rothsee Dart Masters Allersberg', 'frei', 'einzel',
   '2026-08-02T10:00:00+02:00', '', '', '', ''),
  ('Doppel Rothsee Dart Masters Allersberg', 'frei', 'doppel',
   '2026-08-01T12:00:00+02:00', '', '', '', ''),
  ('2. Golden Arrows Einzelturnier Schwabach', 'frei', 'einzel',
   '2026-08-29T10:00:00+02:00', '', '09:00',
   'https://2k-dart-software.com/frontend/events/2/registration/697/register',
   'https://2k-dart-software.com/frontend/events/2/event/33348/participants')
) as v(title, kind, mode, starts_at, deadline, doors, reg, info)
where not exists (
  select 1 from public.tournaments t
  where t.title = v.title
    and t.starts_at::date = v.starts_at::timestamptz::date
);
