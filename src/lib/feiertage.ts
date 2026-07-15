// Gesetzliche Feiertage in Bayern – im Code berechnet (kein externer
// Dienst): feste Termine plus die beweglichen rund um Ostern.
// Nur Anzeige/Abo in der Mitglieder-App – wird NICHT in den Dart-Feed
// übernommen (die Competition-App pflegt ihre Feiertage selbst).

/** Ostersonntag als UTC-Zeitstempel (Butcher/Meeus-Algorithmus). */
function ostersonntag(jahr: number): number {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(jahr, monat - 1, tag);
}

const TAG = 864e5;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface Feiertag {
  datum: string; // JJJJ-MM-TT
  name: string;
}

export function feiertageBayern(jahr: number): Feiertag[] {
  const ostern = ostersonntag(jahr);
  return [
    { datum: `${jahr}-01-01`, name: "Neujahr" },
    { datum: `${jahr}-01-06`, name: "Heilige Drei Könige" },
    { datum: iso(ostern - 2 * TAG), name: "Karfreitag" },
    { datum: iso(ostern + 1 * TAG), name: "Ostermontag" },
    { datum: `${jahr}-05-01`, name: "Tag der Arbeit" },
    { datum: iso(ostern + 39 * TAG), name: "Christi Himmelfahrt" },
    { datum: iso(ostern + 50 * TAG), name: "Pfingstmontag" },
    { datum: iso(ostern + 60 * TAG), name: "Fronleichnam" },
    { datum: `${jahr}-08-15`, name: "Mariä Himmelfahrt" },
    { datum: `${jahr}-10-03`, name: "Tag der Deutschen Einheit" },
    { datum: `${jahr}-11-01`, name: "Allerheiligen" },
    { datum: `${jahr}-12-25`, name: "1. Weihnachtsfeiertag" },
    { datum: `${jahr}-12-26`, name: "2. Weihnachtsfeiertag" },
  ].sort((a, b) => a.datum.localeCompare(b.datum));
}
