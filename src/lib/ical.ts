// Minimaler iCal-Parser (ohne externe Abhängigkeit) für nuLiga-Kalenderexporte.

export interface IcalEvent {
  uid: string;
  summary: string;
  location: string;
  description: string;
  start: string; // ISO
  end: string | null; // ISO
}

/** Letzter Sonntag eines Monats (1-12) als Tag. */
function lastSunday(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - weekday;
}

/** Europe/Berlin-Offset ("+01:00"/"+02:00") für ein Datum. */
function berlinOffset(y: number, m: number, d: number): string {
  const t = Date.UTC(y, m - 1, d);
  const dstStart = Date.UTC(y, 2, lastSunday(y, 3)); // Ende März
  const dstEnd = Date.UTC(y, 9, lastSunday(y, 10)); // Ende Oktober
  return t >= dstStart && t < dstEnd ? "+02:00" : "+01:00";
}

/**
 * Wandelt einen iCal-Datumswert in eine ISO-Zeit um.
 * UTC-Werte (Endung "Z") werden direkt übernommen, alles andere (naiv
 * oder mit TZID) als Europe/Berlin interpretiert.
 */
function parseIcalDate(value: string): string | null {
  const v = value.trim();

  // Nur Datum (ganztägig): 20250913
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly) {
    const [, y, mo, d] = dateOnly;
    return `${y}-${mo}-${d}T00:00:00${berlinOffset(+y, +mo, +d)}`;
  }

  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!dt) return null;
  const [, y, mo, d, h, mi, s, z] = dt;
  if (z) {
    return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`; // UTC
  }
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${berlinOffset(+y, +mo, +d)}`;
}

function unescape(text: string): string {
  return text
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

export function parseIcal(raw: string): IcalEvent[] {
  // Zeilen entfalten (Fortsetzungszeilen beginnen mit Leerzeichen/Tab).
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  const events: IcalEvent[] = [];
  let cur: Partial<IcalEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur && cur.start) {
        events.push({
          uid: cur.uid ?? crypto.randomUUID(),
          summary: cur.summary ?? "Termin",
          location: cur.location ?? "",
          description: cur.description ?? "",
          start: cur.start,
          end: cur.end ?? null,
        });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const head = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const name = head.split(";")[0].toUpperCase();

    switch (name) {
      case "UID":
        cur.uid = value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescape(value);
        break;
      case "LOCATION":
        cur.location = unescape(value);
        break;
      case "DESCRIPTION":
        cur.description = unescape(value);
        break;
      case "DTSTART":
        cur.start = parseIcalDate(value) ?? undefined;
        break;
      case "DTEND":
        cur.end = parseIcalDate(value) ?? undefined;
        break;
    }
  }

  return events;
}
