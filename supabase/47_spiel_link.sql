-- 47: 2k-Link je Spieltermin – Kapitän/Admin pflegt ihn am Spieltag,
-- er erscheint für alle auf der Terminseite und wird automatisch in die
-- Heimspiel-Nachricht an den Gegner eingebaut.
-- Mehrfach ausführbar (idempotent).

alter table events
  add column if not exists match_url text not null default '';
