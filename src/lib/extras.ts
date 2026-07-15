// Turniere & Competitions im Umkreis: Typen und Anzeigetexte.

export interface Tournament {
  id: string;
  title: string;
  kind: "ddv" | "bdv" | "bezirk" | "frei";
  mode: "einzel" | "doppel";
  starts_at: string;
  ends_at?: string | null; // optionales Turnierende (mehrtägig)
  details_tbd?: boolean | null; // noch keine Details verfügbar – „Details folgen“
  entry_deadline: string | null;
  doors_time?: string | null; // Einlass, z. B. "12:00"
  location: string;
  notes?: string | null; // Kommentar, z. B. Hinweise zur Anmeldung
  flyer_url: string;
  register_url: string;
  info_url: string;
  display_until: string;
  created_by: string | null;
  created_at: string;
}

/** Konkreter Termin unserer eigenen Competition (für den Dart-Feed). */
export interface CompetitionDate {
  id: string;
  date: string; // JJJJ-MM-TT
  event_url: string;
  nr: number | null;
  boards?: number | null; // Anzahl Dartboards
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
  flyer_url?: string | null;
  onsite_signup: boolean;
  boards?: number | null; // Anzahl Dartboards
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

/** Römische Mannschafts-Nummer: 1 → "" (erste Mannschaft ohne Zusatz). */
export function romanTeamNo(no?: number | null): string {
  if (!no || no <= 1) return "";
  const steps: [number, string][] = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
    [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
    [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let n = Math.round(no);
  let out = "";
  for (const [value, symbol] of steps) {
    while (n >= value) {
      out += symbol;
      n -= value;
    }
  }
  return out;
}

/** "Ostring 28, 91154 Roth" aus Straße / PLZ / Ort. */
export function composeAddress(
  street?: string | null,
  zip?: string | null,
  city?: string | null,
): string {
  const line2 = [zip, city].filter(Boolean).join(" ");
  return [street, line2].filter(Boolean).join(", ");
}
