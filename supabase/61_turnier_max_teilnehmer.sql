-- 61: Turniere – maximale Teilnehmerzahl (leer/NULL = unbegrenzt).
-- Mehrfach ausführbar (idempotent).

alter table tournaments add column if not exists max_participants int;
