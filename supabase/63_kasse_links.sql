-- 63: Wichtige Kassen-Links (Kassenbuch + Getränkeliste) vorbelegen.
-- Ablage in secure_settings → nur über den Server lesbar, Einsicht in der
-- App nur mit Kassen-Berechtigung. Format: eine Zeile „Titel | Adresse“.
--
-- „on conflict do nothing“: Sind bereits Links gepflegt, bleibt alles
-- unverändert – spätere Änderungen werden NIE überschrieben.

insert into secure_settings (key, value)
values (
  'kasse_links',
  E'Kassenbuch | https://docs.google.com/spreadsheets/d/1aa4MK8Bh3fxHJ3y2rgyfCHdTXoJ1pPM_CixCYToZS4c/edit?usp=sharing\nGetränke (nur Leserechte) | https://docs.google.com/spreadsheets/d/1iLgC6PkHfGOTO1GTn_czGthEa3EpOvOFG90ljfMsBUc/edit?usp=drivesdk'
)
on conflict (key) do nothing;
