-- 52: Spielbericht am Spieltermin (aus nuLiga eingefügt): alle
-- Einzel/Doppel mit Spielern und Ergebnissen – Grundlage für die
-- Spielerstatistik. Mehrfach ausführbar (idempotent).

alter table events
  add column if not exists match_stats jsonb;
