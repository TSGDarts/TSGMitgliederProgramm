-- 57: Eintrittsdatum „Mitglied seit" (optional) für die Jubiläums-Anzeige.
-- Mehrfach ausführbar (idempotent).

alter table profiles       add column if not exists member_since date;
alter table member_invites add column if not exists member_since date;
