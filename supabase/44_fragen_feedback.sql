-- 44: Fragen-Seite wird „Fragen & Feedback“ – jeder Beitrag bekommt eine
-- Art: Frage (Standard), Lob, Kritik/Verbesserung, Idee oder Problem.
-- Mehrfach ausführbar (idempotent).

alter table questions
  add column if not exists kind text not null default 'frage';

alter table questions
  drop constraint if exists questions_kind_check;
alter table questions
  add constraint questions_kind_check
  check (kind in ('frage', 'lob', 'kritik', 'idee', 'problem'));
