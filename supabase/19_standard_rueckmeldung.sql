-- =====================================================================
-- Erweiterung: Standard-Rückmeldung pro Mannschaft
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- '' = keine Vorbelegung, 'yes'/'no'/'maybe' = alle starten mit diesem
-- Status (der Grund-Text für Absagen nutzt die vorhandene Spalte
-- rsvps.comment).
-- =====================================================================

alter table public.teams
  add column if not exists default_rsvp text not null default ''
  check (default_rsvp in ('', 'yes', 'no', 'maybe'));
