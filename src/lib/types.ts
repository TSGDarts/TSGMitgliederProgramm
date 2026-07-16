// Zentrale Typen für die Datenbank-Tabellen.

export type Role = "admin" | "editor" | "player" | "member";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  editor: "Bearbeiter",
  player: "Spieler (Liga)",
  member: "Mitglied (ohne Liga)",
};

export const VALID_ROLES: Role[] = ["admin", "editor", "player", "member"];
export type EventType =
  | "match"
  | "pokal"
  | "friendly"
  | "training"
  | "meeting"
  | "fest"
  | "other";
export type RsvpStatus = "yes" | "no" | "maybe";

export interface Profile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  birthday?: string | null; // JJJJ-MM-TT
  birthday_public?: boolean | null; // im Mitglieder-Kalender anzeigen?
  birthday_congrats?: boolean | null; // in der Mitgliedergruppe gratulieren ok?
  role: Role;
  is_trainer?: boolean | null; // darf Trainings eintragen (Haken vom Admin)
  is_planner?: boolean | null; // darf Saisonplanungs-Entwürfe pflegen
  training_default_rsvp?: string | null; // ''|yes|maybe|no – Vorbelegung für Trainings
  notify_email?: boolean | null; // Benachrichtigungen zusätzlich per E-Mail
  notify_turnier_woche?: boolean | null; // (alt) Erinnerung 1 Woche vor Turnieren
  notify_turnier_tage?: number | null; // (alt) Erinnerung X Tage vor Turnieren
  notify_erinnerungen?: Record<string, number[]> | null; // z. B. {"turniere":[14,7,1]}
  notify_trotz_absage?: boolean | null; // Erinnerung auch nach eigener Absage
  notify_trotz_zusage?: boolean | null; // Erinnerung auch nach eigener Zusage
  notify_trotz_vielleicht?: boolean | null; // Erinnerung auch bei „Vielleicht“
  is_active: boolean;
  left_on?: string | null; // Austrittsdatum (JJJJ-MM-TT) – ab dann deaktiviert
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
  default_rsvp?: "" | "yes" | "no" | "maybe" | null; // Vorbelegung für Termine
  spielmodus?: string | null; // Liga-Spielmodus dieser Mannschaft
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

export interface Opponent {
  id: string;
  name: string;
  address: string; // zusammengesetzt aus Straße/PLZ/Ort
  street?: string | null;
  zip?: string | null;
  city?: string | null;
  boards?: number | null; // Anzahl Dartboards beim Gegner
  contact_name?: string | null; // Ansprechpartner (für die Heimspiel-Nachricht)
  notes: string;
  created_at: string;
}

export interface EventRow {
  id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  meeting_url?: string | null; // Online-Link (Teams, Meet, …)
  match_url?: string | null; // 2k-Link zum Spiel (Live-Verfolgen, Gegner-Nachricht)
  result?: string | null; // Endergebnis, z. B. "8:10"
  meet_home_time?: string | null; // Treffpunkt bei der TSG, z. B. "18:30"
  meet_venue_time?: string | null; // Treffpunkt vor Ort
  opponent_id?: string | null;
  opponent_team_no?: number | null;
  home_away?: "" | "heim" | "auswaerts" | null;
  type: EventType;
  starts_at: string;
  ends_at: string | null;
  time_tbd?: boolean | null; // genaue Uhrzeit noch nicht bekannt
  feed_export?: boolean | null; // an die Competition-App übergeben (Dart-Feed)
  trainer_ids?: string[] | null; // anwesende Trainer (nur bei Trainings)
  contact_ids?: string[] | null; // Ansprechpartner (mehrere möglich)
  source: "manual" | "nuliga";
  source_uid: string | null;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
}

/**
 * Aus der Competition-App gespiegelter Competition-Abend? Reine Anzeige –
 * ohne Zu-/Absage (Anmeldung & Pflege laufen über die Competition-App).
 */
export function isCompSpiegel(ev: { source_uid?: string | null }): boolean {
  return (ev.source_uid ?? "").startsWith("comp-app:cd-");
}

/**
 * Ordnet einen Termin einer Kategorie zu (für Kalender-Abo und
 * Erinnerungen): punktspiele, pokal, freundschaft, training, feste,
 * competitions (gespiegelte Competition-Abende) oder verein.
 * Besprechungen und „Sonstiges“ zählen als Vereinstermine.
 */
export function eventKategorie(
  ev: Pick<EventRow, "team_id" | "type" | "source_uid">,
): string {
  if (isCompSpiegel(ev)) return "competitions";
  if (ev.type === "fest") return "feste";
  if (ev.team_id) {
    if (ev.type === "match") return "punktspiele";
    if (ev.type === "pokal") return "pokal";
    if (ev.type === "friendly") return "freundschaft";
    if (ev.type === "training") return "training";
  }
  if (ev.type === "training") return "training";
  return "verein";
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
  kind?: string | null; // frage | lob | kritik | idee | problem
  created_at: string;
}

/** Arten auf der Seite „Fragen & Feedback“ (angelehnt an die Competition-App). */
export const FRAGE_ARTEN: Record<string, string> = {
  frage: "💬 Frage",
  lob: "👍 Lob",
  kritik: "🛠 Kritik / Verbesserung",
  idee: "💡 Idee",
  problem: "⚠️ Problem",
};

/** Art-Label ohne führendes Emoji (z. B. für Mail-Betreffzeilen). */
export function frageArtLabel(kind?: string | null): string {
  return FRAGE_ARTEN[kind ?? "frage"] ?? FRAGE_ARTEN.frage;
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
  fest: "Fest",
  other: "Sonstiges",
};

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  yes: "Zusage",
  no: "Absage",
  maybe: "Vielleicht",
};
