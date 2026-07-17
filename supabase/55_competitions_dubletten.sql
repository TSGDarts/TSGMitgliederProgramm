-- 55: Doppelte Competitions aufräumen (identischer Name + Wochentag +
-- Adresse, z. B. durch doppeltes Absenden des Formulars entstanden).
-- Es bleibt jeweils der älteste Eintrag stehen. Mehrfach ausführbar.

delete from competitions c
using competitions d
where c.title = d.title
  and c.weekday = d.weekday
  and c.address = d.address
  and (
    d.created_at < c.created_at
    or (d.created_at = c.created_at and d.id < c.id)
  );
