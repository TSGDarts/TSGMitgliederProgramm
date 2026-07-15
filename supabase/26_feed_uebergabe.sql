-- =====================================================================
-- Erweiterung: Übergabe an die Competition-App pro Termin steuerbar
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

-- Steuert, ob ein Termin im öffentlichen Dart-Feed (und damit in der
-- Competition-App) erscheint. Standard: ja – wie bisher.
alter table public.events
  add column if not exists feed_export boolean not null default true;
