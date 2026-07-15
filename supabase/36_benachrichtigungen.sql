-- =====================================================================
-- Erweiterung: Benachrichtigungen (Push + E-Mail)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Push-Abos: ein Eintrag pro Gerät, das Push aktiviert hat
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_own" on public.push_subscriptions;
create policy "push_subscriptions_own" on public.push_subscriptions
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Einstellungen am Profil
alter table public.profiles
  add column if not exists notify_email boolean not null default false;
alter table public.profiles
  add column if not exists notify_turnier_woche boolean not null default false;

-- Merkliste bereits verschickter Erinnerungen (verhindert Doppel-Versand;
-- nur der Server schreibt hier – kein Zugriff für normale Logins)
create table if not exists public.notification_log (
  key     text primary key,
  sent_at timestamptz not null default now()
);

alter table public.notification_log enable row level security;
