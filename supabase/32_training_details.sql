-- =====================================================================
-- Erweiterung: Standard-Antwort für Trainings + anwesende Trainer
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Persönliche Vorbelegung für Trainings (stellt jeder im Profil ein):
-- '' = keine, sonst yes/maybe/no – gilt, solange keine eigene Antwort da ist.
alter table public.profiles
  add column if not exists training_default_rsvp text not null default ''
  check (training_default_rsvp in ('', 'yes', 'maybe', 'no'));

-- Welche Trainer bei einem Training anwesend sind (mehrere möglich)
alter table public.events
  add column if not exists trainer_ids uuid[] not null default '{}';
