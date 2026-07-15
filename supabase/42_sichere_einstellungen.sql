-- =====================================================================
-- Erweiterung: Geschützte Einstellungen (z. B. E-Mail-Zugangsdaten)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Im Gegensatz zu app_settings können diese Werte NICHT von Mitgliedern
-- gelesen werden: RLS ist an, aber es gibt keine Lese-Richtlinie –
-- nur der Server (Service-Rolle) kommt heran.
create table if not exists public.secure_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.secure_settings enable row level security;
