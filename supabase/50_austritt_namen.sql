-- 50: Austrittsdatum auch für vorab angelegte Namen (noch nicht
-- angemeldet). Ab dem Stichtag: nicht mehr bei der Selbst-Anmeldung
-- wählbar, raus aus den Planungs-Listen, sichtbar unter „Ehemalige
-- Mitglieder“ (wieder aktivierbar). Mehrfach ausführbar (idempotent).

alter table member_invites
  add column if not exists left_on date;
