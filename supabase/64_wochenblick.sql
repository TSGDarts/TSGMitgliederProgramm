-- 64: Sonntags-Überblick per Push/E-Mail („Deine Dart-Woche“): Termine der
-- kommenden Woche + offene Rückmeldungen, verschickt vom täglichen
-- Erinnerungs-Lauf. Standard: eingeschaltet, im Profil abwählbar.
-- Mehrfach ausführbar (idempotent).

alter table profiles add column if not exists notify_wochenblick boolean not null default true;
