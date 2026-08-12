-- 65: Trikotgrößen-Abfrage. Der Admin öffnet/schließt die Abfrage über die
-- App-Einstellungen; Mitglieder wählen ihre aktuelle Größe selbst im Profil.
-- Mehrfach ausführbar (idempotent).

alter table profiles add column if not exists jersey_size text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_jersey_size_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_jersey_size_check
      check (jersey_size in (
        '2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL',
        '4XL', '5XL', '6XL', '7XL', '8XL', '9XL'
      ));
  end if;
end $$;

insert into app_settings (key, value)
values ('jersey_survey_open', 'false')
on conflict (key) do nothing;

-- Die allgemeine Einstellungs-Tabelle ist auch für Bearbeiter beschreibbar.
-- Diesen vereinsweiten Abfrage-Schalter dürfen jedoch nur Admins ändern.
create or replace function public.guard_jersey_survey_setting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.key = 'jersey_survey_open'
    and auth.role() <> 'service_role'
    and not public.is_admin()
  then
    raise exception 'Nicht berechtigt.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_jersey_survey_setting on public.app_settings;
create trigger guard_jersey_survey_setting
  before insert or update on public.app_settings
  for each row execute function public.guard_jersey_survey_setting();

-- Auch direkte Profil-Updates außerhalb der App dürfen die Größe nur bei
-- offener Abfrage ändern. Service-Rolle (Admin-Verwaltung) bleibt unberührt.
create or replace function public.guard_jersey_size_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.jersey_size is distinct from old.jersey_size
    and auth.role() <> 'service_role'
    and not exists (
      select 1 from app_settings
      where key = 'jersey_survey_open' and value = 'true'
    )
  then
    raise exception 'Die Trikotgrößen-Abfrage ist geschlossen.';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_jersey_size_update on public.profiles;
create trigger guard_jersey_size_update
  before update of jersey_size on public.profiles
  for each row execute function public.guard_jersey_size_update();

-- Umschalten mit Zeilensperre; true bedeutet ausschließlich: soeben von
-- geschlossen auf offen gewechselt.
create or replace function public.set_jersey_survey_open(
  new_open boolean
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  was_open boolean;
begin
  if not public.is_admin() then
    raise exception 'Nicht berechtigt.';
  end if;

  insert into app_settings (key, value)
  values ('jersey_survey_open', 'false')
  on conflict (key) do nothing;

  select value = 'true' into was_open
  from app_settings
  where key = 'jersey_survey_open'
  for update;

  update app_settings
  set value = new_open::text, updated_at = now()
  where key = 'jersey_survey_open';

  return new_open and not was_open;
end;
$$;

-- Statusprüfung und Speichern geschehen in einer Transaktion. Die Funktion
-- liefert false, wenn die Abfrage geschlossen ist.
create or replace function public.set_own_jersey_size(new_size text)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from profiles
    where id = auth.uid() and is_active
  ) then
    return false;
  end if;

  -- Dieselbe Einstellungszeile sperrt auch der Admin beim Umschalten. So ist
  -- das Speichern eindeutig vor oder nach dem Schließen eingeordnet.
  perform 1 from app_settings
  where key = 'jersey_survey_open' and value = 'true'
  for update;
  if not found then return false; end if;

  update profiles
  set jersey_size = new_size
  where id = auth.uid();
  return found;
end;
$$;
