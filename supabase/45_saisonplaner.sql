-- 45: Saisonplaner – vom Admin berechtigte Personen dürfen eigene
-- Planungs-Entwürfe (Mannschaften/Kapitäne) anlegen und die Entwürfe
-- der anderen Planer sowie die Abfrage-Antworten einsehen.
-- Mehrfach ausführbar (idempotent).

-- (a) Berechtigung am Profil und an vorab angelegten Namen (wird bei der
-- Registrierung automatisch übernommen)
alter table profiles
  add column if not exists is_planner boolean not null default false;
alter table member_invites
  add column if not exists is_planner boolean not null default false;

-- (b) Ein Entwurf je Person und Saison. RLS an, KEINE Policies:
-- Zugriff läuft ausschließlich über den Server (Service-Rolle) mit
-- eigener Berechtigungsprüfung.
create table if not exists season_plans (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  owner_id uuid not null references profiles(id) on delete cascade,
  notes text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (season_id, owner_id)
);
alter table season_plans enable row level security;
