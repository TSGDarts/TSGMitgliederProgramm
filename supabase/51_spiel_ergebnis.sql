-- 51: Endergebnis am Spieltermin (z. B. "8:10") – Pflege in der
-- Archiv-Saison (Spieltage-Liste) und Grundlage für die kommende
-- Spielerstatistik. Mehrfach ausführbar (idempotent).

alter table events
  add column if not exists result text not null default '';
