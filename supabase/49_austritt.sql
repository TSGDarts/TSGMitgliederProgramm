-- 49: Mitglieder-Austritt – Austrittsdatum am Profil. Ab diesem Tag wird
-- das Mitglied automatisch deaktiviert (Login gesperrt) und erscheint
-- unter „Ehemalige Mitglieder“; Wieder-Aktivieren ist jederzeit möglich.
-- Mehrfach ausführbar (idempotent).

alter table profiles
  add column if not exists left_on date;
