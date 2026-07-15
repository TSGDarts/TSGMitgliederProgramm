// Zentrale Typen für die Datenbank-Tabellen.

export type Role = "admin" | "player" | "member";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  player: "Spieler (Liga)",
  member: "Mitglied (ohne Liga)",
};

export const VALID_ROLES: Role[] = ["admin", "player", "member"];
export type EventType =
  | "match"
  | "pokal"
  | "friendly"
  | "training"
  | "meeting"
  | "other";
export type RsvpStatus = "yes" | "no" | "maybe";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  is_active: boolean;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  league: string | null;
  nuliga_url: string | null;
  nuliga_ical_url: string | null;
  home_match_weekday?: number | null; // 1 = Montag … 7 = Sonntag
  home_match_time?: string | null; // z. B. "20:00"
  sort_order: number;
  created_at: string;
}

export interface TeamMember {
  team_id: string;
  profile_id: string;
  is_captain: boolean;
  is_vice_captain: boolean;
  jersey_number: number | null;
}

export interface EventRow {
  id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url?: string | null; // Online-Link (Teams, Meet, …)
  type: EventType;
  starts_at: string;
  ends_at: string | null;
  source: "manual" | "nuliga";
  source_uid: string | null;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Rsvp {
  event_id: string;
  profile_id: string;
  status: RsvpStatus;
  comment: string | null;
  updated_at: string;
}

export interface Question {
  id: string;
  team_id: string | null;
  author_id: string | null;
  title: string;
  body: string | null;
  created_at: string;
}

export interface Answer {
  id: string;
  question_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  match: "Punktspiel",
  pokal: "Pokalspiel",
  friendly: "Freundschaftsspiel",
  training: "Training",
  meeting: "Besprechung",
  other: "Sonstiges",
};

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  yes: "Zusage",
  no: "Absage",
  maybe: "Vielleicht",
};
