-- 43: Neue Termin-Art „Fest“ + Erinnerungs-Haken je eigener Antwort.
-- Mehrfach ausführbar (idempotent).

-- (a) Termin-Art 'fest' zusätzlich erlauben
alter table events
  drop constraint if exists events_type_check;
alter table events
  add constraint events_type_check
  check (type in ('match', 'pokal', 'friendly', 'training', 'meeting', 'fest', 'other'));

-- (b) Erinnerungen je nach eigener Antwort steuerbar: Standard = bei Zusage
-- und „Vielleicht“ weiterhin erinnern, nach Absage nicht
-- (notify_trotz_absage gibt es bereits aus Skript 41).
alter table profiles
  add column if not exists notify_trotz_zusage boolean not null default true;
alter table profiles
  add column if not exists notify_trotz_vielleicht boolean not null default true;
