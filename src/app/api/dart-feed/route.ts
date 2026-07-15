import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import {
  TOURNAMENT_KIND_LABELS,
  type Tournament,
  type Competition,
} from "@/lib/extras";

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

  const [{ data: compData }, { data: tourData }, { data: weeklyData }] =
    await Promise.all([
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
    ]);

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
    if (t.doors_time) out.einlass = t.doors_time;
    const uhrzeit = berlinTime.format(start);
    if (uhrzeit !== "00:00") out.uhrzeit = uhrzeit;
    if (t.entry_deadline) {
      const deadline = new Date(t.entry_deadline);
      out.meldeschluss = berlinDate.format(deadline);
      const zeit = berlinTime.format(deadline);
      if (zeit !== "00:00") out.meldeschlussZeit = zeit;
    }
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

  return NextResponse.json(
    { kommendeCompetitions, turniere, woechentlicheCompetitions },
    {
      headers: {
        ...CORS,
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
