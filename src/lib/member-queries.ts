import { createClient } from "@/lib/supabase/server";
import { getEventArchiveDays } from "@/lib/settings";
import type {
  EventRow,
  Profile,
  RsvpStatus,
  Team,
  TeamMember,
} from "@/lib/types";

export type EventWithStatus = EventRow & {
  myStatus: RsvpStatus | null;
  myComment: string;
  teamName: string | null;
};

async function myTeamIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("profile_id", userId);
  return (data ?? []).map((r) => r.team_id as string);
}

export async function getTeamsMap(): Promise<Map<string, Team>> {
  const supabase = await createClient();
  const { data } = await supabase.from("teams").select("*");
  return new Map((data as Team[] | null)?.map((t) => [t.id, t]) ?? []);
}

/** Kommende (oder vergangene) Termine, die für den Nutzer relevant sind. */
export async function getMemberEvents(
  userId: string,
  opts: { past?: boolean; limit?: number } = {},
): Promise<EventWithStatus[]> {
  const supabase = await createClient();
  const teamIds = await myTeamIds(userId);
  const nowIso = new Date().toISOString();

  let query = supabase.from("events").select("*");
  if (opts.past) {
    // Vergangene nur bis zur Archiv-Frist anzeigen; noch laufende
    // mehrtägige Termine gehören nicht hierher, sondern zu „Kommende“
    const archiveDays = await getEventArchiveDays();
    const cutoffIso = new Date(
      Date.now() - archiveDays * 864e5,
    ).toISOString();
    query = query
      .lt("starts_at", nowIso)
      .gte("starts_at", cutoffIso)
      .or(`ends_at.is.null,ends_at.lt.${nowIso}`)
      .order("starts_at", { ascending: false });
  } else {
    // Kommende: auch bereits begonnene Termine, deren Ende noch aussteht
    query = query
      .or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`)
      .order("starts_at", { ascending: true });
  }
  if (opts.limit) query = query.limit(opts.limit * 3);

  const { data } = await query;
  const events = (data as EventRow[] | null) ?? [];

  // Relevanz: vereinsweite Termine (team_id = null) oder eigene Mannschaft.
  const relevant = events.filter(
    (e) => e.team_id === null || teamIds.includes(e.team_id),
  );
  const limited = opts.limit ? relevant.slice(0, opts.limit) : relevant;

  const ids = limited.map((e) => e.id);
  const rsvpMap = new Map<string, RsvpStatus>();
  const commentMap = new Map<string, string>();
  if (ids.length) {
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("event_id,status,comment")
      .eq("profile_id", userId)
      .in("event_id", ids);
    (rsvps ?? []).forEach((r) => {
      rsvpMap.set(r.event_id as string, r.status as RsvpStatus);
      commentMap.set(r.event_id as string, (r.comment as string) ?? "");
    });
  }

  // Persönliche Vorbelegung für Trainings (aus dem Profil)
  const { data: me } = await supabase
    .from("profiles")
    .select("training_default_rsvp")
    .eq("id", userId)
    .maybeSingle();
  const trainingDefault = ((me?.training_default_rsvp as string) ||
    null) as RsvpStatus | null;

  const teams = await getTeamsMap();
  return limited.map((e) => {
    const team = e.team_id ? teams.get(e.team_id) : undefined;
    // Ohne eigene Antwort greift bei Trainings die persönliche Vorbelegung,
    // sonst die Standard-Rückmeldung der Mannschaft.
    const teamDefault = (team?.default_rsvp || null) as RsvpStatus | null;
    const fallback =
      e.type === "training" && trainingDefault ? trainingDefault : teamDefault;
    return {
      ...e,
      myStatus: rsvpMap.get(e.id) ?? fallback,
      myComment: commentMap.get(e.id) ?? "",
      teamName: team?.name ?? null,
    };
  });
}

export async function getEvent(id: string): Promise<EventRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as EventRow) ?? null;
}

export type Participant = {
  profile: Profile;
  status: RsvpStatus | null;
  isDefault: boolean; // Status kommt aus der Team-Vorbelegung, nicht aktiv gewählt
  comment: string;
  isCaptain: boolean;
  isViceCaptain: boolean;
};

/**
 * Teilnehmerliste eines Termins mit Zu-/Absage-Status.
 * Bei Mannschaftsterminen: der Kader. Bei vereinsweiten Terminen: alle aktiven Mitglieder.
 */
export async function getEventParticipants(
  event: EventRow,
): Promise<Participant[]> {
  const supabase = await createClient();

  let profiles: Profile[] = [];
  const captainIds = new Set<string>();
  const viceIds = new Set<string>();

  // Termine mit Einladungsliste: Teilnehmer = die Eingeladenen
  const { data: invited } = await supabase
    .from("event_invitees")
    .select("profile_id, profiles(*)")
    .eq("event_id", event.id);

  if (invited && invited.length > 0) {
    profiles = invited
      .map((m) => m.profiles as unknown as Profile)
      .filter(Boolean);
  } else if (event.team_id) {
    const { data: members } = await supabase
      .from("team_members")
      .select("profile_id,is_captain,is_vice_captain,profiles(*)")
      .eq("team_id", event.team_id);
    profiles = (members ?? []).map((m) => {
      if (m.is_captain) captainIds.add(m.profile_id as string);
      if (m.is_vice_captain) viceIds.add(m.profile_id as string);
      return m.profiles as unknown as Profile;
    });
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true);
    profiles = (data as Profile[] | null) ?? [];
  }

  profiles = profiles.filter(Boolean);
  const ids = profiles.map((p) => p.id);

  const rsvpMap = new Map<string, RsvpStatus>();
  const commentMap = new Map<string, string>();
  if (ids.length) {
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("profile_id,status,comment")
      .eq("event_id", event.id)
      .in("profile_id", ids);
    (rsvps ?? []).forEach((r) => {
      rsvpMap.set(r.profile_id as string, r.status as RsvpStatus);
      commentMap.set(r.profile_id as string, (r.comment as string) ?? "");
    });
  }

  // Standard-Rückmeldung der Mannschaft (greift ohne eigene Antwort)
  let teamDefault: RsvpStatus | null = null;
  if (event.team_id) {
    const { data: team } = await supabase
      .from("teams")
      .select("default_rsvp")
      .eq("id", event.team_id)
      .maybeSingle();
    teamDefault = ((team?.default_rsvp as string) || null) as RsvpStatus | null;
  }

  return profiles
    .map((p) => {
      const own = rsvpMap.get(p.id) ?? null;
      // Bei Trainings hat die persönliche Vorbelegung der Person Vorrang
      const persoenlich =
        event.type === "training"
          ? (((p.training_default_rsvp as string) || null) as RsvpStatus | null)
          : null;
      const standard = persoenlich ?? teamDefault;
      return {
        profile: p,
        status: own ?? standard,
        isDefault: own === null && standard !== null,
        comment: commentMap.get(p.id) ?? "",
        isCaptain: captainIds.has(p.id),
        isViceCaptain: viceIds.has(p.id),
      };
    })
    .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name));
}

export async function getAllTeams(): Promise<Team[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("*")
    .order("sort_order")
    .order("name");
  return (data as Team[]) ?? [];
}

export type TeamRosterEntry = TeamMember & { profile: Profile };

export async function getTeamRoster(teamId: string): Promise<TeamRosterEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("team_id,profile_id,is_captain,is_vice_captain,jersey_number,profiles(*)")
    .eq("team_id", teamId);
  return (data ?? [])
    .map((m) => ({
      team_id: m.team_id as string,
      profile_id: m.profile_id as string,
      is_captain: m.is_captain as boolean,
      is_vice_captain: m.is_vice_captain as boolean,
      jersey_number: m.jersey_number as number | null,
      profile: m.profiles as unknown as Profile,
    }))
    .filter((m) => m.profile)
    .sort((a, b) => a.profile.full_name.localeCompare(b.profile.full_name));
}

/** IDs der Teams, die der Nutzer verwalten darf (Admin/Bearbeiter = alle, sonst Kapitän/Vize). */
export async function getManageableTeamIds(
  profile: Profile,
): Promise<Set<string>> {
  if (profile.role === "admin" || profile.role === "editor") {
    const teams = await getAllTeams();
    return new Set(teams.map((t) => t.id));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("team_members")
    .select("team_id,is_captain,is_vice_captain")
    .eq("profile_id", profile.id);
  return new Set(
    (data ?? [])
      .filter((m) => m.is_captain || m.is_vice_captain)
      .map((m) => m.team_id as string),
  );
}
