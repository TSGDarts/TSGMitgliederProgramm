-- 53: Schwarzes Brett (Ankündigungen) + Umfragen.
-- Lesen: alle Eingeloggten. Pflegen: Admins und Bearbeiter.
-- Abstimmen: jedes Mitglied für sich. Mehrfach ausführbar (idempotent).

create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null default '',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table announcements enable row level security;
drop policy if exists "announcements_read" on announcements;
create policy "announcements_read" on announcements
  for select using (auth.uid() is not null);
drop policy if exists "announcements_write" on announcements;
create policy "announcements_write" on announcements
  for all
  using (public.is_admin() or public.is_editor())
  with check (public.is_admin() or public.is_editor());

create table if not exists polls (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  options    text[] not null default '{}',
  multi      boolean not null default false,
  open       boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table polls enable row level security;
drop policy if exists "polls_read" on polls;
create policy "polls_read" on polls
  for select using (auth.uid() is not null);
drop policy if exists "polls_write" on polls;
create policy "polls_write" on polls
  for all
  using (public.is_admin() or public.is_editor())
  with check (public.is_admin() or public.is_editor());

create table if not exists poll_votes (
  poll_id      uuid not null references polls (id) on delete cascade,
  profile_id   uuid not null references profiles (id) on delete cascade,
  option_index int not null,
  created_at   timestamptz not null default now(),
  primary key (poll_id, profile_id, option_index)
);
alter table poll_votes enable row level security;
drop policy if exists "poll_votes_read" on poll_votes;
create policy "poll_votes_read" on poll_votes
  for select using (auth.uid() is not null);
drop policy if exists "poll_votes_insert" on poll_votes;
create policy "poll_votes_insert" on poll_votes
  for insert with check (profile_id = auth.uid());
drop policy if exists "poll_votes_delete" on poll_votes;
create policy "poll_votes_delete" on poll_votes
  for delete using (profile_id = auth.uid());
