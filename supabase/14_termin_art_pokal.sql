-- =====================================================================
-- Erweiterung: Termin-Art "Pokalspiel"
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.events
  drop constraint if exists events_type_check;

alter table public.events
  add constraint events_type_check
  check (type in ('match', 'pokal', 'friendly', 'training', 'meeting', 'other'));
