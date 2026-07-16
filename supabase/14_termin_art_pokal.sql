-- =====================================================================
-- Erweiterung: Termin-Art "Pokalspiel"
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

alter table public.events
  drop constraint if exists events_type_check;

-- (seit Skript 43 inkl. 'fest' – sonst scheitert ein erneuter Lauf,
-- sobald es bereits Termine der Art „Fest“ gibt)
alter table public.events
  add constraint events_type_check
  check (type in ('match', 'pokal', 'friendly', 'training', 'meeting', 'fest', 'other'));
