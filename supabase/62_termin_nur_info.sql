-- 62: Termine „nur zur Info" – keine Zu-/Absage nötig (z. B. Betriebsurlaub
-- des Wirts). Standard bleibt: Rückmeldung erwünscht. Mehrfach ausführbar.

alter table events add column if not exists info_only boolean not null default false;
