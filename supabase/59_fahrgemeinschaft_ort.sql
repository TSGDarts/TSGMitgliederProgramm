-- 59: Fahrgemeinschaft – kleine Mitfahr-Planung: von wo (Startort/Abholort),
-- Ziel und ein freier Zeit-/Abfahrts-Hinweis. Mehrfach ausführbar.

alter table event_carpool add column if not exists ort text not null default '';
alter table event_carpool add column if not exists ziel text not null default '';
alter table event_carpool add column if not exists abfahrt text not null default '';
