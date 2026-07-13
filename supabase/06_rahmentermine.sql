-- =====================================================================
-- Rahmenterminplan 2026/27 + 2027/28 in den Gesamtkalender eintragen
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen. Kann gefahrlos erneut
-- ausgeführt werden (bestehende Einträge werden aktualisiert).
-- Quelle: "Rahmenterminplan 2026-2027 / 2027-2028_Neu.pdf"
-- Jeder Eintrag steht am Montag der jeweiligen Spielwoche.
-- =====================================================================

insert into public.events
  (team_id, title, description, location, type, starts_at, source, source_uid, is_public)
values
  -- ---------------- Saison 2026/27 – Mittelfranken ----------------
  (null, '1. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 14.09. – So. 20.09.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-09-14T00:00:00+02:00', 'manual', 'rahmen:2627:kw38:spieltag1', true),
  (null, '2. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 21.09. – So. 27.09.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-09-21T00:00:00+02:00', 'manual', 'rahmen:2627:kw39:spieltag2', true),
  (null, '1. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 28.09. – So. 04.10.2026.', '', 'other', '2026-09-28T00:00:00+02:00', 'manual', 'rahmen:2627:kw40:rlt1', true),
  (null, '3. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 12.10. – So. 18.10.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-10-12T00:00:00+02:00', 'manual', 'rahmen:2627:kw42:spieltag3', true),
  (null, '4. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 19.10. – So. 25.10.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-10-19T00:00:00+02:00', 'manual', 'rahmen:2627:kw43:spieltag4', true),
  (null, '2. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 26.10. – So. 01.11.2026.', '', 'other', '2026-10-26T00:00:00+01:00', 'manual', 'rahmen:2627:kw44:rlt2', true),
  (null, '5. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 02.11. – So. 08.11.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-11-02T00:00:00+01:00', 'manual', 'rahmen:2627:kw45:spieltag5', true),
  (null, '6. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 23.11. – So. 29.11.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-11-23T00:00:00+01:00', 'manual', 'rahmen:2627:kw48:spieltag6', true),
  (null, '7. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 30.11. – So. 06.12.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-11-30T00:00:00+01:00', 'manual', 'rahmen:2627:kw49:spieltag7', true),
  (null, '8. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 07.12. – So. 13.12.2026. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2026-12-07T00:00:00+01:00', 'manual', 'rahmen:2627:kw50:spieltag8', true),
  (null, '9. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 04.01. – So. 10.01.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-01-04T00:00:00+01:00', 'manual', 'rahmen:2627:kw01:spieltag9', true),
  (null, '10. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 25.01. – So. 31.01.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-01-25T00:00:00+01:00', 'manual', 'rahmen:2627:kw04:spieltag10', true),
  (null, '11. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 08.02. – So. 14.02.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-02-08T00:00:00+01:00', 'manual', 'rahmen:2627:kw06:spieltag11', true),
  (null, '3. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 15.02. – So. 21.02.2027.', '', 'other', '2027-02-15T00:00:00+01:00', 'manual', 'rahmen:2627:kw07:rlt3', true),
  (null, '12. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 22.02. – So. 28.02.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-02-22T00:00:00+01:00', 'manual', 'rahmen:2627:kw08:spieltag12', true),
  (null, '13. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 01.03. – So. 07.03.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-03-01T00:00:00+01:00', 'manual', 'rahmen:2627:kw09:spieltag13', true),
  (null, '14. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 15.03. – So. 21.03.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-03-15T00:00:00+01:00', 'manual', 'rahmen:2627:kw11:spieltag14', true),
  (null, '15. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 29.03. – So. 04.04.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-03-29T00:00:00+02:00', 'manual', 'rahmen:2627:kw13:spieltag15', true),
  (null, '16. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 12.04. – So. 18.04.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-04-12T00:00:00+02:00', 'manual', 'rahmen:2627:kw15:spieltag16', true),
  (null, '4. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 19.04. – So. 25.04.2027.', '', 'other', '2027-04-19T00:00:00+02:00', 'manual', 'rahmen:2627:kw16:rlt4', true),
  (null, '17. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 26.04. – So. 02.05.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-04-26T00:00:00+02:00', 'manual', 'rahmen:2627:kw17:spieltag17', true),
  (null, 'Pokalfinale / Final 4 – Mittelfranken', 'Rahmenterminplan: Woche Mo. 03.05. – So. 09.05.2027.', '', 'other', '2027-05-03T00:00:00+02:00', 'manual', 'rahmen:2627:kw18:pokalfinale', true),
  (null, '18. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 10.05. – So. 16.05.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-05-10T00:00:00+02:00', 'manual', 'rahmen:2627:kw19:spieltag18', true),
  (null, 'Relegation – Mittelfranken',        'Rahmenterminplan: Woche Mo. 17.05. – So. 23.05.2027.', '', 'other', '2027-05-17T00:00:00+02:00', 'manual', 'rahmen:2627:kw20:relegation', true),
  (null, 'DDV-Cup / Verbandspokal',           'Rahmenterminplan: Woche Mo. 31.05. – So. 06.06.2027.', '', 'other', '2027-05-31T00:00:00+02:00', 'manual', 'rahmen:2627:kw22:ddvcup', true),
  (null, '4er-Verbandspokal',                 'Rahmenterminplan: Woche Mo. 07.06. – So. 13.06.2027.', '', 'other', '2027-06-07T00:00:00+02:00', 'manual', 'rahmen:2627:kw23:4erpokal', true),
  (null, 'German Masters',                    'Rahmenterminplan: Woche Mo. 14.06. – So. 20.06.2027.', '', 'other', '2027-06-14T00:00:00+02:00', 'manual', 'rahmen:2627:kw24:germanmasters', true),
  (null, 'Bayrisch Masters',                  'Rahmenterminplan: Woche Mo. 21.06. – So. 27.06.2027.', '', 'other', '2027-06-21T00:00:00+02:00', 'manual', 'rahmen:2627:kw25:bayrischmasters', true),
  (null, '5. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 28.06. – So. 04.07.2027.', '', 'other', '2027-06-28T00:00:00+02:00', 'manual', 'rahmen:2627:kw26:rlt5', true),

  -- ---------------- Saison 2027/28 – Mittelfranken ----------------
  (null, '1. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 13.09. – So. 19.09.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-09-13T00:00:00+02:00', 'manual', 'rahmen:2728:kw36:spieltag1', true),
  (null, '2. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 20.09. – So. 26.09.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-09-20T00:00:00+02:00', 'manual', 'rahmen:2728:kw37:spieltag2', true),
  (null, '1. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 27.09. – So. 03.10.2027.', '', 'other', '2027-09-27T00:00:00+02:00', 'manual', 'rahmen:2728:kw38:rlt1', true),
  (null, '3. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 11.10. – So. 17.10.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-10-11T00:00:00+02:00', 'manual', 'rahmen:2728:kw40:spieltag3', true),
  (null, '4. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 18.10. – So. 24.10.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-10-18T00:00:00+02:00', 'manual', 'rahmen:2728:kw41:spieltag4', true),
  (null, '5. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 25.10. – So. 31.10.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-10-25T00:00:00+02:00', 'manual', 'rahmen:2728:kw42:spieltag5', true),
  (null, '6. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 01.11. – So. 07.11.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-11-01T00:00:00+01:00', 'manual', 'rahmen:2728:kw43:spieltag6', true),
  (null, '2. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 22.11. – So. 28.11.2027.', '', 'other', '2027-11-22T00:00:00+01:00', 'manual', 'rahmen:2728:kw46:rlt2', true),
  (null, '7. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 29.11. – So. 05.12.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-11-29T00:00:00+01:00', 'manual', 'rahmen:2728:kw47:spieltag7', true),
  (null, '8. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 06.12. – So. 12.12.2027. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2027-12-06T00:00:00+01:00', 'manual', 'rahmen:2728:kw48:spieltag8', true),
  (null, '9. Spieltag – Liga Mittelfranken',  'Rahmenterminplan: Spielwoche Mo. 10.01. – So. 16.01.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-01-10T00:00:00+01:00', 'manual', 'rahmen:2728:kw01:spieltag9', true),
  (null, '10. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 17.01. – So. 23.01.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-01-17T00:00:00+01:00', 'manual', 'rahmen:2728:kw02:spieltag10', true),
  (null, '11. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 07.02. – So. 13.02.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-02-07T00:00:00+01:00', 'manual', 'rahmen:2728:kw05:spieltag11', true),
  (null, '12. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 14.02. – So. 20.02.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-02-14T00:00:00+01:00', 'manual', 'rahmen:2728:kw06:spieltag12', true),
  (null, '13. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 21.02. – So. 27.02.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-02-21T00:00:00+01:00', 'manual', 'rahmen:2728:kw07:spieltag13', true),
  (null, '14. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 13.03. – So. 19.03.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-03-13T00:00:00+01:00', 'manual', 'rahmen:2728:kw10:spieltag14', true),
  (null, '3. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 20.03. – So. 26.03.2028.', '', 'other', '2028-03-20T00:00:00+01:00', 'manual', 'rahmen:2728:kw11:rlt3', true),
  (null, '15. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 27.03. – So. 02.04.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-03-27T00:00:00+02:00', 'manual', 'rahmen:2728:kw12:spieltag15', true),
  (null, '16. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 24.04. – So. 30.04.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-04-24T00:00:00+02:00', 'manual', 'rahmen:2728:kw16:spieltag16', true),
  (null, '17. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 01.05. – So. 07.05.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-05-01T00:00:00+02:00', 'manual', 'rahmen:2728:kw17:spieltag17', true),
  (null, '18. Spieltag – Liga Mittelfranken', 'Rahmenterminplan: Spielwoche Mo. 08.05. – So. 14.05.2028. Genauer Termin laut nuLiga-Spielplan der Mannschaft.', '', 'match', '2028-05-08T00:00:00+02:00', 'manual', 'rahmen:2728:kw18:spieltag18', true),
  (null, '4. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 15.05. – So. 21.05.2028.', '', 'other', '2028-05-15T00:00:00+02:00', 'manual', 'rahmen:2728:kw19:rlt4', true),
  (null, 'Pokalfinale / Final 4 – Mittelfranken', 'Rahmenterminplan: Woche Mo. 22.05. – So. 28.05.2028.', '', 'other', '2028-05-22T00:00:00+02:00', 'manual', 'rahmen:2728:kw20:pokalfinale', true),
  (null, 'Relegation – Mittelfranken',        'Rahmenterminplan: Woche Mo. 29.05. – So. 04.06.2028.', '', 'other', '2028-05-29T00:00:00+02:00', 'manual', 'rahmen:2728:kw21:relegation', true),
  (null, 'DDV-Cup / Verbandspokal',           'Rahmenterminplan: Woche Mo. 29.05. – So. 04.06.2028.', '', 'other', '2028-05-29T00:00:00+02:00', 'manual', 'rahmen:2728:kw21:ddvcup', true),
  (null, '4er-Verbandspokal',                 'Rahmenterminplan: Woche Mo. 05.06. – So. 11.06.2028.', '', 'other', '2028-06-05T00:00:00+02:00', 'manual', 'rahmen:2728:kw22:4erpokal', true),
  (null, 'German Masters',                    'Rahmenterminplan: Woche Mo. 12.06. – So. 18.06.2028.', '', 'other', '2028-06-12T00:00:00+02:00', 'manual', 'rahmen:2728:kw23:germanmasters', true),
  (null, 'Bayrische Masters',                 'Rahmenterminplan: Woche Mo. 19.06. – So. 25.06.2028.', '', 'other', '2028-06-19T00:00:00+02:00', 'manual', 'rahmen:2728:kw24:bayrischmasters', true),
  (null, '5. RLT Mittelfranken',              'Rahmenterminplan: Ranglistenturnier, Woche Mo. 26.06. – So. 02.07.2028.', '', 'other', '2028-06-26T00:00:00+02:00', 'manual', 'rahmen:2728:kw25:rlt5', true)

on conflict (source_uid) where source_uid is not null
do update set
  title       = excluded.title,
  description = excluded.description,
  type        = excluded.type,
  starts_at   = excluded.starts_at,
  is_public   = excluded.is_public;
