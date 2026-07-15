import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatDate, formatTime } from "@/lib/format";
import { feiertageBayern } from "@/lib/feiertage";
import type { EventRow } from "@/lib/types";
import type { Tournament } from "@/lib/extras";

// Öffentlicher Abo-Kalender (ICS, ohne Login abrufbar): alle ÖFFENTLICHEN
// Vereins- und Mannschaftstermine plus Turniere. Enthält bewusst KEINE
// Geburtstage und keine internen Termine – die Adresse kann geteilt werden.
//
// Filter (stellen Mitglieder auf der Termine-Seite zusammen):
//   ?team=<id>            nur die Termine dieser Mannschaft (Vereinstermine bleiben)
//   ?arten=a,b,c          nur diese Kategorien: punktspiele, pokal, freundschaft,
//                         training, verein, turniere, competitions
//   ?alle=pokal,…         diese Kategorien trotz Mannschafts-Filter von ALLEN
//                         Mannschaften liefern (z. B. alle Pokalspiele)
//   ?turnierarten=a,b     nur diese Turnierarten: ddv, bdv, bezirk, frei
//   ?punktspieleTeams=…   nur diese Mannschaften (Ids) bei Punktspielen
//   ?pokalTeams=… / ?freundschaftTeams=…   dito für Pokal/Freundschaft
// Ohne Parameter: alles (bestehende Abos laufen unverändert weiter).
export const dynamic = "force-dynamic";

const ALLE_ARTEN = [
  "punktspiele",
  "pokal",
  "freundschaft",
  "training",
  "verein",
  "turniere",
  "competitions",
] as const;

// Zusätzlich wählbar, aber NICHT im Standard (ohne ?arten-Parameter):
// Feiertage muss man bewusst mit abonnieren.
const GUELTIGE_ARTEN = [...ALLE_ARTEN, "feiertage"];

/** Ordnet einen Termin einer Abo-Kategorie zu. */
function eventKategorie(ev: EventRow): string {
  // Aus der Competition-App gespiegelte Competition-Abende
  if ((ev.source_uid ?? "").startsWith("comp-app:cd-")) return "competitions";
  if (ev.team_id) {
    if (ev.type === "match") return "punktspiele";
    if (ev.type === "pokal") return "pokal";
    if (ev.type === "friendly") return "freundschaft";
    if (ev.type === "training") return "training";
  }
  // Vereinsweite Termine + Team-Besprechungen/Sonstiges
  return "verein";
}

const berlinDay = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const berlinTime = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** ISO-Zeitpunkt als ICS-UTC-Stempel, z. B. 20260918T173000Z */
function utcStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** Berliner Kalendertag als ICS-Datum, z. B. 20260918 */
function dayStamp(iso: string): string {
  return berlinDay.format(new Date(iso)).replace(/-/g, "");
}

/** Folgetag (für DTEND ganztägiger Termine; +36h ist sicher über DST-Wechsel) */
function nextDayStamp(iso: string): string {
  return berlinDay
    .format(new Date(new Date(iso).getTime() + 36 * 3600e3))
    .replace(/-/g, "");
}

/** RFC 5545: lange Zeilen falten (Fortsetzungszeilen beginnen mit Leerzeichen) */
function fold(line: string): string {
  let out = "";
  let rest = line;
  while (rest.length > 74) {
    out += rest.slice(0, 74) + "\r\n ";
    rest = rest.slice(74);
  }
  return out + rest;
}

export async function GET(request: Request) {
  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json(
      { error: "Kalender nicht konfiguriert." },
      { status: 503 },
    );
  }

  // Gewählte Filter aus der Adresse lesen (fehlen sie: alles liefern)
  const params = new URL(request.url).searchParams;
  const teamId = (params.get("team") ?? "").trim();
  const artenRaw = (params.get("arten") ?? "").trim();
  const arten = new Set(
    artenRaw
      ? artenRaw.split(",").filter((a) => GUELTIGE_ARTEN.includes(a))
      : ALLE_ARTEN,
  );
  // Kategorien, die trotz Mannschafts-Filter von allen Mannschaften kommen
  const trotzTeam = new Set(
    (params.get("alle") ?? "").split(",").filter(Boolean),
  );
  // Gewählte Turnierarten (fehlt der Parameter: alle Arten)
  const TURNIER_ARTEN = ["ddv", "bdv", "bezirk", "frei"];
  const turnierartenRaw = (params.get("turnierarten") ?? "").trim();
  const turnierarten = new Set(
    turnierartenRaw
      ? turnierartenRaw.split(",").filter((a) => TURNIER_ARTEN.includes(a))
      : TURNIER_ARTEN,
  );
  // Mannschafts-Auswahl je Kategorie (fehlt der Parameter: alle Mannschaften)
  const teamListe = (name: string): Set<string> | null => {
    const raw = (params.get(name) ?? "").trim();
    return raw ? new Set(raw.split(",").filter(Boolean)) : null;
  };
  const teamsJeArt: Record<string, Set<string> | null> = {
    punktspiele: teamListe("punktspieleTeams"),
    pokal: teamListe("pokalTeams"),
    freundschaft: teamListe("freundschaftTeams"),
  };

  // Kalendername: bei Mannschafts-Filter den Teamnamen mit aufnehmen
  let kalName = "TSG 08 Roth Dart";
  if (teamId) {
    const { data: team } = await admin
      .from("teams")
      .select("name")
      .eq("id", teamId)
      .maybeSingle();
    if (team?.name) kalName = `${team.name} (Dart)`;
  }

  // Ein Jahr zurück, damit Abo-Kalender auch die jüngere Vergangenheit zeigen
  const seit = new Date(Date.now() - 366 * 864e5).toISOString();

  const [{ data: eventData }, { data: tourData }] = await Promise.all([
    admin
      .from("events")
      .select("*")
      .eq("is_public", true)
      .gte("starts_at", seit)
      .order("starts_at"),
    admin
      .from("tournaments")
      .select("*")
      .gte("starts_at", seit)
      .order("starts_at"),
  ]);

  const stamp = utcStamp(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TSG 08 Roth Dart//Mitglieder-App//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(kalName)}`,
    "X-WR-TIMEZONE:Europe/Berlin",
  ];

  function pushEvent(o: {
    uid: string;
    start: string;
    end?: string | null;
    allDay: boolean;
    summary: string;
    location?: string | null;
    description?: string;
  }) {
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

  for (const ev of ((eventData as EventRow[]) ?? [])) {
    // Gewählte Kategorien + Mannschafts-Filter anwenden
    const kategorie = eventKategorie(ev);
    if (!arten.has(kategorie)) continue;
    if (
      teamId &&
      ev.team_id &&
      ev.team_id !== teamId &&
      !trotzTeam.has(kategorie)
    )
      continue;
    // Mannschafts-Auswahl je Kategorie (z. B. nur 1. und 3. Mannschaft)
    const gewaehlteTeams = teamsJeArt[kategorie];
    if (gewaehlteTeams && ev.team_id && !gewaehlteTeams.has(ev.team_id)) {
      continue;
    }
    const allDay =
      !!ev.time_tbd || berlinTime.format(new Date(ev.starts_at)) === "00:00";
    const description = [
      ev.time_tbd ? "⏳ Genaue Uhrzeit folgt noch" : "",
      ev.description ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    pushEvent({
      uid: `event-${ev.id}@tsg08roth-dart`,
      start: ev.starts_at,
      end: ev.ends_at,
      allDay,
      summary: ev.title,
      location: ev.location,
      description,
    });
  }

  for (const t of arten.has("turniere") ? ((tourData as Tournament[]) ?? []) : []) {
    // Nur gewählte Turnierarten (z. B. ohne DDV-Turniere)
    if (!turnierarten.has(t.kind)) continue;
    // Von Hand archivierte Turniere („Anzeigen bis“ vor dem Turniertag) auslassen
    const startKey = berlinDay.format(new Date(t.starts_at));
    if (t.display_until && t.display_until < startKey) continue;
    const allDay =
      !!t.details_tbd || berlinTime.format(new Date(t.starts_at)) === "00:00";
    const description = [
      t.details_tbd ? "⏳ Details folgen" : "",
      !t.details_tbd && t.doors_time ? `Einlass ab ${t.doors_time} Uhr` : "",
      !t.details_tbd && t.entry_deadline
        ? `Meldeschluss: ${formatDate(t.entry_deadline)}, ${formatTime(t.entry_deadline)} Uhr`
        : "",
      !t.details_tbd && t.register_url ? `Anmeldung: ${t.register_url}` : "",
      t.notes ?? "",
    ]
      .filter(Boolean)
      .join("\n");
    pushEvent({
      uid: `tournament-${t.id}@tsg08roth-dart`,
      start: t.starts_at,
      end: t.ends_at,
      allDay,
      summary: `🏟 ${t.title}`,
      location: t.location,
      description,
    });
  }

  // Feiertage in Bayern (nur wenn ausdrücklich mit abonniert)
  if (arten.has("feiertage")) {
    const jahrStart = new Date(seit).getUTCFullYear();
    const jahrEnde = new Date().getUTCFullYear() + 2;
    for (let jahr = jahrStart; jahr <= jahrEnde; jahr++) {
      for (const f of feiertageBayern(jahr)) {
        pushEvent({
          uid: `feiertag-${f.datum}@tsg08roth-dart`,
          start: f.datum,
          allDay: true,
          summary: `⭐ ${f.name}`,
        });
      }
    }
  }

  lines.push("END:VCALENDAR");

  return new NextResponse(lines.map(fold).join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="tsg-dart-termine.ics"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
