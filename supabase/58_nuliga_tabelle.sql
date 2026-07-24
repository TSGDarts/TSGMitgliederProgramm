-- 58: nuLiga-Tabellen-Link je Mannschaft (groupPage-Adresse für die
-- Liga-Tabelle). Mehrfach ausführbar (idempotent).

alter table teams add column if not exists nuliga_table_url text;
