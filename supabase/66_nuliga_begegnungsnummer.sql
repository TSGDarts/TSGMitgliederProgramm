-- 66: Die von nuLiga an Termin-Titel angehängte Begegnungsnummer entfernen.
-- Die Nummer bleibt weiterhin in Beschreibung und Quell-UID erhalten.
-- Mehrfach ausführbar (idempotent).

update public.events
set title = regexp_replace(
  title,
  '[[:space:]]+\([0-9]+\)[[:space:]]*$',
  ''
)
where source = 'nuliga'
  and title ~ '[[:space:]]+\([0-9]+\)[[:space:]]*$'
  and coalesce(description, '') ~ (
    'Begegnungs-Nr:[[:space:]]*'
    || substring(title from '\(([0-9]+)\)[[:space:]]*$')
    || '([[:space:]]|$)'
  );
