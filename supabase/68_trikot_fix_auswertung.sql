-- 68: Trikotgrößen für normale Mitglieder speichern + Auswertung freigeben.
-- Nach 65_trikotgroesse.sql ausführen. Mehrfach ausführbar.
-- Vorhandene Größen und der aktuelle Öffnungsstatus bleiben erhalten.

-- SELECT ... FOR UPDATE unter SECURITY INVOKER benötigt die UPDATE-Policy
-- von app_settings. Die gilt nur für Admin/Bearbeiter: normale Mitglieder
-- fanden deshalb trotz offener Abfrage keine Zeile und erhielten false.
-- Nur diese eng begrenzte Funktion darf die Zeile mit erhöhten Rechten
-- sperren. Nutzerkennung und aktives Profil werden weiterhin geprüft.
create or replace function public.set_own_jersey_size(new_size text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
  ) then
    return false;
  end if;

  if new_size is null or new_size not in (
    '2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL',
    '4XL', '5XL', '6XL', '7XL', '8XL', '9XL'
  ) then
    raise exception 'Bitte wähle eine gültige Trikotgröße aus.'
      using errcode = '23514';
  end if;

  -- Dieselbe Zeilensperre wie beim Öffnen/Schließen bleibt erhalten.
  perform 1 from public.app_settings
  where key = 'jersey_survey_open' and value = 'true'
  for update;
  if not found then return false; end if;

  -- Keine fremde Profil-ID und keine weiteren Profilfelder übernehmbar.
  update public.profiles
  set jersey_size = new_size
  where id = auth.uid() and is_active;
  return found;
end;
$$;

revoke all on function public.set_own_jersey_size(text) from public, anon;
grant execute on function public.set_own_jersey_size(text) to authenticated;

-- Eigenständiger Admin-Haken, unabhängig von Trainer-/Bearbeiterrechten.
alter table public.profiles
  add column if not exists can_view_jersey_report boolean not null default false;
alter table public.member_invites
  add column if not exists can_view_jersey_report boolean not null default false;

-- Die allgemeine Profil-Policy erlaubt Änderungen am eigenen Profil.
-- Die neue Auswertungsfreigabe darf sich trotzdem niemand selbst erteilen.
create or replace function public.guard_jersey_report_permission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() is distinct from 'service_role' and not public.is_admin() then
    if tg_op = 'INSERT' then
      if new.can_view_jersey_report then
        raise exception 'Nur Admins dürfen die Trikot-Auswertung freigeben.';
      end if;
    elsif new.can_view_jersey_report is distinct from old.can_view_jersey_report then
      raise exception 'Nur Admins dürfen die Trikot-Auswertung freigeben.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_jersey_report_permission on public.profiles;
create trigger guard_jersey_report_permission
  before insert or update of can_view_jersey_report on public.profiles
  for each row execute function public.guard_jersey_report_permission();

drop trigger if exists guard_jersey_report_permission on public.member_invites;
create trigger guard_jersey_report_permission
  before insert or update of can_view_jersey_report on public.member_invites
  for each row execute function public.guard_jersey_report_permission();
