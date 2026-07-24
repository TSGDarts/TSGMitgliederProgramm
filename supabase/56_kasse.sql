-- 56: Kassenbuch der Dart-Abteilung.
-- Neue Berechtigung „Kassierer" + Tabellen für Kontostand-Importe (Excel
-- vom Hauptverein), Belege/Rechnungen und Auszahlungsanträge der
-- Mitglieder. Alle Tabellen: RLS AN, KEINE Policies → nur der
-- Service-Schlüssel (Server) kommt ran; die Berechtigung prüft der Code.
-- Mehrfach ausführbar (idempotent).

-- Berechtigung „Kassierer" (wie is_trainer / is_planner)
alter table profiles      add column if not exists is_treasurer boolean not null default false;
alter table member_invites add column if not exists is_treasurer boolean not null default false;

-- Monatliche Kontostand-Auswertung (Import der Hauptvereins-Excel)
create table if not exists kasse_import (
  id         uuid primary key default gen_random_uuid(),
  stichtag   date,
  dateiname  text not null default '',
  file_path  text not null default '',   -- Ablage der Original-Datei (Storage)
  einnahmen  numeric(12,2),
  ausgaben   numeric(12,2),
  saldo      numeric(12,2),
  is_current boolean not null default false,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table kasse_import enable row level security;

-- Einzelbuchungen einer Auswertung
create table if not exists kasse_buchung (
  id         uuid primary key default gen_random_uuid(),
  import_id  uuid not null references kasse_import (id) on delete cascade,
  datum      date,
  empfaenger text not null default '',
  betrag     numeric(12,2),
  kategorie  text not null default '',
  konto      text not null default '',
  zweck      text not null default ''
);
alter table kasse_buchung enable row level security;
create index if not exists kasse_buchung_import_idx on kasse_buchung (import_id);

-- Belege/Rechnungen (3k, BDV, Spized …), vom Kassierer abgelegt
create table if not exists kasse_beleg (
  id         uuid primary key default gen_random_uuid(),
  titel      text not null default '',
  empfaenger text not null default '',
  betrag     numeric(12,2),
  datum      date,
  kategorie  text not null default '',
  file_path  text not null default '',
  dateiname  text not null default '',
  note       text not null default '',
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table kasse_beleg enable row level security;

-- Auszahlungsanträge der Mitglieder (Auslagen-Erstattung)
create table if not exists kasse_auslage (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid not null references profiles (id) on delete cascade,
  titel          text not null default '',
  betrag         numeric(12,2),
  datum          date,
  zweck          text not null default '',
  iban           text not null default '',
  file_path      text not null default '',
  dateiname      text not null default '',
  status         text not null default 'eingereicht'
                 check (status in ('eingereicht','genehmigt','abgelehnt','ausgezahlt')),
  bearbeiter_id  uuid references profiles (id) on delete set null,
  bearbeiter_note text not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table kasse_auslage enable row level security;
create index if not exists kasse_auslage_profile_idx on kasse_auslage (profile_id);
create index if not exists kasse_auslage_status_idx on kasse_auslage (status);

-- Privater Storage-Bucket für Kassen-Dateien (Belege, Auswertungen, Fotos)
insert into storage.buckets (id, name, public)
values ('kasse', 'kasse', false)
on conflict (id) do nothing;

-- Hochladen dürfen angemeldete Nutzer (Beleg-Fotos für Auslagen);
-- Ansehen/Download läuft ausschließlich über serverseitig erzeugte
-- Signed-URLs (Service-Schlüssel) nach Berechtigungsprüfung – daher
-- KEINE Lese-Policy.
drop policy if exists "kasse_upload" on storage.objects;
create policy "kasse_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kasse');

drop policy if exists "kasse_delete" on storage.objects;
create policy "kasse_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'kasse' and (public.is_admin() or owner = auth.uid()));
