-- 48: Neuer Benachrichtigungs-Standard „fürs Erste“:
-- Erinnerungen 14 + 7 + 3 Tage vorher bei ALLEN Termin-Arten (inkl. Feste)
-- und E-Mail-Versand standardmäßig AN. Jede Person kann das im Profil
-- weiterhin individuell anpassen – wer schon eigene Werte gesetzt hat,
-- bleibt unangetastet (deshalb ist das Skript gefahrlos wiederholbar).

alter table public.profiles
  alter column notify_erinnerungen set default
  '{"punktspiele":[14,7,3],"pokal":[14,7,3],"freundschaft":[14,7,3],"training":[14,7,3],"feste":[14,7,3],"verein":[14,7,3],"turniere":[14,7,3]}'::jsonb;

alter table public.profiles
  alter column notify_email set default true;

-- Nur Profile umstellen, die noch auf einem ALTEN Standard stehen
-- (leer, „Turniere 7 Tage“ oder der bisherige 7+3-Standard) – individuell
-- angepasste Profile werden bewusst NICHT angefasst.
update public.profiles
set notify_erinnerungen =
  '{"punktspiele":[14,7,3],"pokal":[14,7,3],"freundschaft":[14,7,3],"training":[14,7,3],"feste":[14,7,3],"verein":[14,7,3],"turniere":[14,7,3]}'::jsonb,
  notify_email = true
where notify_erinnerungen = '{}'::jsonb
   or notify_erinnerungen = '{"turniere": [7]}'::jsonb
   or notify_erinnerungen = '{"punktspiele":[7,3],"pokal":[7,3],"freundschaft":[7,3],"training":[7,3],"verein":[7,3],"turniere":[7,3]}'::jsonb;
