-- =====================================================================
-- Erweiterung: Automatisches Termin-Archiv (einstellbare Frist)
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Mitglieder dürfen die App-Einstellungen lesen (z. B. die Archiv-Frist).
drop policy if exists "app_settings_read" on public.app_settings;
create policy "app_settings_read" on public.app_settings
  for select using (auth.uid() is not null);

-- Standard: Termine 30 Tage nach ihrem Datum archivieren
insert into public.app_settings (key, value)
values ('event_archive_days', '30')
on conflict (key) do nothing;
