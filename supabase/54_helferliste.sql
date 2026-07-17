-- 54: Helferliste bei Heimspielen (Theke, Aufbau, Essen …).
-- Jeder pflegt nur seinen eigenen Eintrag. Mehrfach ausführbar (idempotent).

create table if not exists event_helpers (
  event_id   uuid not null references events (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  aufgabe    text not null default '',
  updated_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);
alter table event_helpers enable row level security;
drop policy if exists "event_helpers_read" on event_helpers;
create policy "event_helpers_read" on event_helpers
  for select using (auth.uid() is not null);
drop policy if exists "event_helpers_write" on event_helpers;
create policy "event_helpers_write" on event_helpers
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());
