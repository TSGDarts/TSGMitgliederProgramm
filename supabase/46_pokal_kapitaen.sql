-- 46: Pokal-Kapitän – je Pokal-Team kann ein Kapitän ernannt werden.
-- Mehrfach ausführbar (idempotent).

alter table pokal_squads
  add column if not exists is_captain boolean not null default false;
