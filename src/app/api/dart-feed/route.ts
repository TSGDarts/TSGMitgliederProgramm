import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  TOURNAMENT_KIND_LABELS,
  romanTeamNo,
  type Tournament,
  type Competition,
} from "@/lib/extras";
import type { EventRow } from "@/lib/types";

// Öffentlicher, schreibgeschützter Feed (ohne Login) mit unseren
// Competition-Terminen und Turnieren. Enthält KEINE Mitgliederdaten.
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
} as const;

const berlinDate = new Intl.DateTimeFormat("sv-SE", {
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

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET() {
  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json(
      { error: "Feed nicht konfiguriert." },
      { status: 503, headers: CORS },
    );
  }

  const today = berlinDate.format(new Date()); // JJJJ-MM-TT

  const [
    { data: compData },
    { data: tourData },
    { data: weeklyData },
    { data: gamesData },
    { data: teamsData },
    { data: oppsData },
  ] = await Promise.all([
    admin
      .from("competition_dates")
      .select("date, event_url, nr, boards")
      .gte("date", today)
      .order("date", { ascending: true }),
    admin
      .from("tournaments")
      .select("*")
      .gte("display_until", today)
      .order("starts_at", { ascending: true }),
    admin
      .from("competitions")
      .select("*")
      .eq("is_active", true)
      .order("weekday")
      .order("start_time"),
    // Nur öffentliche Spieltermine der Mannschaften (keine Besprechungen,
    // kein Training, keine internen/eingeschränkten Termine)
    admin
      .from("events")
      .select("*")
      .not("team_id", "is", null)
      .eq("is_public", true)
      .in("type", ["match", "pokal", "friendly"])
      .gte("starts_at", new Date(Date.now() - 26 * 3600e3).toISOString())
      .order("starts_at", { ascending: true }),
    admin.from("teams").select("id, name"),
    admin.from("opponents").select("id, name"),
  ]);

  // Öffentliche Vereinstermine (z. B. Sommerfest): vereinsweit (ohne
  // Mannschaft), Art "Sonstiges" oder "Fest" – Besprechungen, Training und
  // Mannschafts-Termine bleiben damit sicher draußen. Auch vergangene
  // mitliefern, damit das Archiv der Competition-App erhalten bleibt.
  const { data: clubEventsData } = await admin
    .from("events")
    .select("*")
    .is("team_id", null)
    .eq("is_public", true)
    .in("type", ["other", "fest"])
    .order("starts_at", { ascending: true });

  const kommendeCompetitions = (compData ?? []).map((c) => {
    const out: Record<string, unknown> = { datum: c.date as string };
    if (c.event_url) out.eventUrl = c.event_url;
    if (c.nr !== null && c.nr !== undefined) out.nr = c.nr;
    if (c.boards !== null && c.boards !== undefined) out.boards = c.boards;
    return out;
  });

  const turniere = ((tourData as Tournament[]) ?? []).map((t) => {
    const start = new Date(t.starts_at);
    const out: Record<string, unknown> = {
      name: t.title,
      art: TOURNAMENT_KIND_LABELS[t.kind] ?? t.kind,
      datum: berlinDate.format(start),
    };
    // Mehrtägig: Endtag mitgeben (nur wenn er vom Starttag abweicht)
    if (t.ends_at) {
      const bis = berlinDate.format(new Date(t.ends_at));
      if (bis !== out.datum) out.bisDatum = bis;
    }
    if (t.details_tbd) {
      // Noch keine Details bekannt: Zeiten/Meldeschluss weglassen
      out.detailsFolgen = true;
    } else {
      if (t.doors_time) out.einlass = t.doors_time;
      const uhrzeit = berlinTime.format(start);
      if (uhrzeit !== "00:00") out.uhrzeit = uhrzeit;
      if (t.entry_deadline) {
        const deadline = new Date(t.entry_deadline);
        out.meldeschluss = berlinDate.format(deadline);
        const zeit = berlinTime.format(deadline);
        if (zeit !== "00:00") out.meldeschlussZeit = zeit;
      }
    }
    if (t.notes) out.hinweis = t.notes;
    if (t.info_url) out.url = t.info_url;
    if (t.register_url) out.anmeldeUrl = t.register_url;
    return out;
  });

  // Wöchentliche Competitions im Umkreis (inkl. Boards)
  const woechentlicheCompetitions = ((weeklyData as Competition[]) ?? []).map(
    (c) => {
      const out: Record<string, unknown> = {
        name: c.title,
        wochentag: c.weekday, // 1 = Montag … 7 = Sonntag
        beginn: c.start_time,
      };
      if (c.mode) out.modus = c.mode;
      if (c.doors_time) out.einlass = c.doors_time;
      if (c.signup_until) out.anmeldenBis = c.signup_until;
      if (c.address) out.adresse = c.address;
      if (c.register_url) out.anmeldeUrl = c.register_url;
      if (c.boards !== null && c.boards !== undefined) out.boards = c.boards;
      out.anmeldungVorOrt = c.onsite_signup;
      return out;
    },
  );

  // Spieltermine der Mannschaften
  const teamNameById = new Map(
    (teamsData ?? []).map((t) => [t.id as string, t.name as string]),
  );
  const oppNameById = new Map(
    (oppsData ?? []).map((o) => [o.id as string, o.name as string]),
  );
  const spiele = (((gamesData as EventRow[]) ?? [])).flatMap((ev) => {
    // Pro Termin abwählbar: „an die Competition-App übergeben“
    if (ev.feed_export === false) return [];
    const start = new Date(ev.starts_at);
    const datum = berlinDate.format(start);
    if (datum < today) return [];
    const out: Record<string, unknown> = { datum };
    const uhrzeit = berlinTime.format(start);
    if (!ev.time_tbd && uhrzeit !== "00:00") out.uhrzeit = uhrzeit;
    const mannschaft = ev.team_id ? teamNameById.get(ev.team_id) : undefined;
    if (mannschaft) out.mannschaft = mannschaft;
    if (ev.opponent_id) {
      const base = oppNameById.get(ev.opponent_id);
      if (base) {
        const suffix = romanTeamNo(ev.opponent_team_no);
        out.gegner = suffix ? `${base} ${suffix}` : base;
      }
    }
    if (ev.home_away === "heim") out.heim = true;
    else if (ev.home_away === "auswaerts") out.heim = false;
    if (ev.location) out.ort = ev.location;
    return [out];
  });

  // Öffentliche Vereinstermine – inkl. vergangener (Archiv der Competition-App).
  // Einträge mit source_uid "comp-app:…" stammen aus der Competition-App selbst
  // (comp-import) und werden NICHT zurückgeliefert – sonst kämen sie dort doppelt an.
  const termine = (((clubEventsData as EventRow[]) ?? []))
    .filter(
      (ev) =>
        ev.feed_export !== false &&
        !(ev.source_uid ?? "").startsWith("comp-app:"),
    )
    .map((ev) => {
    const start = new Date(ev.starts_at);
    const out: Record<string, unknown> = {
      datum: berlinDate.format(start),
      text: ev.title,
    };
    const zeit = berlinTime.format(start);
    if (!ev.time_tbd && zeit !== "00:00") out.zeit = zeit;
    return out;
  });

  return NextResponse.json(
    { kommendeCompetitions, turniere, woechentlicheCompetitions, spiele, termine },
    {
      headers: {
        ...CORS,
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
