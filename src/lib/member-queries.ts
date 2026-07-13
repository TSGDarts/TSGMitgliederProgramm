import { createClient } from "@/lib/supabase/server";
import type {
  EventRow,
  Profile,
  RsvpStatus,
  Team,
  TeamMember,
} from "@/lib/types";

export type EventWithStatus = EventRow & {
  myStatus: RsvpStatus | null;
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
  query = opts.past
    ? query.lt("starts_at", nowIso).order("starts_at", { ascending: false })
    : query.gte("starts_at", nowIso).order("starts_at", { ascending: true });
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
  if (ids.length) {
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("event_id,status")
      .eq("profile_id", userId)
      .in("event_id", ids);
    (rsvps ?? []).forEach((r) =>
      rsvpMap.set(r.event_id as string, r.status as RsvpStatus),
    );
  }

  const teams = await getTeamsMap();
  return limited.map((e) => ({
    ...e,
    myStatus: rsvpMap.get(e.id) ?? null,
    teamName: e.team_id ? (teams.get(e.team_id)?.name ?? null) : null,
  }));
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

  if (event.team_id) {
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
  if (ids.length) {
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("profile_id,status")
      .eq("event_id", event.id)
      .in("profile_id", ids);
    (rsvps ?? []).forEach((r) =>
      rsvpMap.set(r.profile_id as string, r.status as RsvpStatus),
    );
  }

  return profiles
    .map((p) => ({
      profile: p,
      status: rsvpMap.get(p.id) ?? null,
      isCaptain: captainIds.has(p.id),
      isViceCaptain: viceIds.has(p.id),
    }))
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

/** IDs der Teams, die der Nutzer verwalten darf (Admin = alle, sonst Kapitän/Vize). */
export async function getManageableTeamIds(
  profile: Profile,
): Promise<Set<string>> {
  if (profile.role === "admin") {
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
