-- 60: Fahrgemeinschaft – Mitfahrer kann angeben, bei welchem Fahrer er
-- mitfährt (für die Sammel-Route des Fahrers). Mehrfach ausführbar.

alter table event_carpool
  add column if not exists fahrer_id uuid references profiles (id) on delete set null;
