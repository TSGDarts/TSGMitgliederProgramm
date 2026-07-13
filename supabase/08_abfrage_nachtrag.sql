-- =====================================================================
-- Erweiterung: Saisonabfrage-Antworten für noch nicht registrierte
-- Namen (Selbst-Anmeldung). Beim Registrieren wandern die Antworten
-- automatisch zum neuen Mitgliedskonto.
-- ---------------------------------------------------------------------
-- Im Supabase SQL-Editor EINMALIG ausführen.
-- =====================================================================

create table if not exists public.survey_responses_invites (
  season_id          uuid not null references public.seasons (id) on delete cascade,
  invite_id          uuid not null references public.member_invites (id) on delete cascade,
  played_last_season boolean,
  play_frequency     text not null default '',
  captain_interest   text not null default '',
  team_wishes        text not null default '',
  ambitions          text not null default '',
  sit_out            text not null default '',
  pokal_ku           text not null default '',
  pokal_8er          text not null default '',
  updated_at         timestamptz not null default now(),
  primary key (season_id, invite_id)
);

alter table public.survey_responses_invites enable row level security;

drop policy if exists "survey_invites_admin" on public.survey_responses_invites;
create policy "survey_invites_admin" on public.survey_responses_invites
  for all using (public.is_admin()) with check (public.is_admin());
