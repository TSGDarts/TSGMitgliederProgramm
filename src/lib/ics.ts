// Gemeinsame Helfer zum Erzeugen von ICS-Kalenderdateien (RFC 5545) –
// genutzt vom öffentlichen Abo-Kalender (/api/kalender) und vom
// Einzeltermin-Download auf der Termin-Detailseite.

const berlinDayFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const berlinTimeFmt = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

/** Berliner Uhrzeit „HH:MM“ eines ISO-Zeitpunkts (für die 00:00-Erkennung). */
export function berlinClock(iso: string): string {
  return berlinTimeFmt.format(new Date(iso));
}

export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** ISO-Zeitpunkt als ICS-UTC-Stempel, z. B. 20260918T173000Z */
export function utcStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Berliner Kalendertag als ICS-Datum, z. B. 20260918 */
export function dayStamp(iso: string): string {
  return berlinDayFmt.format(new Date(iso)).replace(/-/g, "");
}

/**
 * Folgetag (für DTEND ganztägiger Termine, exklusiv nach RFC 5545):
 * erst den Berliner Kalendertag bestimmen, dann rein kalendarisch +1 Tag.
 * (Das frühere pauschale +36h machte Termine mit Nachmittags-/Abend-
 * Zeitstempel, die als ganztägig ausgegeben werden, einen Tag zu lang.)
 */
export function nextDayStamp(iso: string): string {
  const [j, m, t] = berlinDayFmt.format(new Date(iso)).split("-").map(Number);
  const folgetag = new Date(Date.UTC(j, m - 1, t + 1));
  return (
    `${folgetag.getUTCFullYear()}` +
    `${String(folgetag.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(folgetag.getUTCDate()).padStart(2, "0")}`
  );
}

/** RFC 5545: lange Zeilen falten (Fortsetzungszeilen beginnen mit Leerzeichen) */
export function fold(line: string): string {
  let out = "";
  let rest = line;
  while (rest.length > 74) {
    // Nicht mitten in einem Emoji (Surrogat-Paar) trennen – das würde
    // beim Kodieren kaputte Zeichen erzeugen
    let schnitt = 74;
    const code = rest.charCodeAt(schnitt - 1);
    if (code >= 0xd800 && code <= 0xdbff) schnitt--;
    out += rest.slice(0, schnitt) + "\r\n ";
    rest = rest.slice(schnitt);
  }
  return out + rest;
}

export interface IcsVevent {
  uid: string;
  start: string; // ISO
  end?: string | null; // ISO
  allDay: boolean;
  summary: string;
  location?: string | null;
  description?: string;
}

/** Ein VEVENT als ICS-Zeilen an `lines` anhängen. */
export function pushVevent(lines: string[], stamp: string, o: IcsVevent) {
  lines.push("BEGIN:VEVENT", `UID:${o.uid}`, `DTSTAMP:${stamp}`);
  if (o.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${dayStamp(o.start)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDayStamp(o.end ?? o.start)}`);
  } else {
    lines.push(`DTSTART:${utcStamp(o.start)}`);
    if (o.end) lines.push(`DTEND:${utcStamp(o.end)}`);
  }
  lines.push(`SUMMARY:${icsEscape(o.summary)}`);
  if (o.location) lines.push(`LOCATION:${icsEscape(o.location)}`);
  if (o.description) lines.push(`DESCRIPTION:${icsEscape(o.description)}`);
  lines.push("END:VEVENT");
}

/** Kalender-Kopf (BEGIN:VCALENDAR …) – danach VEVENTs, dann icsAbschluss. */
export function icsKopf(kalName: string): string[] {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TSG 08 Roth Dart//Mitglieder-App//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(kalName)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
  ];
}

/** Zeilen falten und zur fertigen ICS-Datei zusammensetzen. */
export function icsDatei(lines: string[]): string {
  return [...lines, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
