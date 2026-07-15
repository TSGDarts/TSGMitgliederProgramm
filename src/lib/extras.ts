// Turniere & Competitions im Umkreis: Typen und Anzeigetexte.

export interface Tournament {
  id: string;
  title: string;
  kind: "ddv" | "bdv" | "bezirk" | "frei";
  mode: "einzel" | "doppel";
  starts_at: string;
  entry_deadline: string | null;
  location: string;
  flyer_url: string;
  register_url: string;
  info_url: string;
  display_until: string;
  created_by: string | null;
  created_at: string;
}

export interface Competition {
  id: string;
  title: string;
  weekday: number; // 1 = Montag … 7 = Sonntag
  mode: string;
  doors_time: string;
  start_time: string;
  signup_until: string;
  address: string;
  register_url: string;
  onsite_signup: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export const TOURNAMENT_KIND_LABELS: Record<Tournament["kind"], string> = {
  ddv: "DDV-Turnier",
  bdv: "BDV-Turnier",
  bezirk: "Bezirksturnier",
  frei: "Freies Turnier",
};

export const TOURNAMENT_MODE_LABELS: Record<Tournament["mode"], string> = {
  einzel: "Einzel",
  doppel: "Doppel",
};

export const WEEKDAYS = [
  { value: 1, label: "Montag", short: "Mo" },
  { value: 2, label: "Dienstag", short: "Di" },
  { value: 3, label: "Mittwoch", short: "Mi" },
  { value: 4, label: "Donnerstag", short: "Do" },
  { value: 5, label: "Freitag", short: "Fr" },
  { value: 6, label: "Samstag", short: "Sa" },
  { value: 7, label: "Sonntag", short: "So" },
] as const;

export function weekdayLabel(value: number): string {
  return WEEKDAYS.find((w) => w.value === value)?.label ?? "?";
}

/** "Freitags, 20:00 Uhr" aus Wochentag + Uhrzeit einer Mannschaft. */
export function formatHomeMatch(
  weekday?: number | null,
  time?: string | null,
): string {
  if (!weekday) return "";
  const day = weekdayLabel(weekday);
  return time ? `${day}s, ${time} Uhr` : `${day}s`;
}

export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
