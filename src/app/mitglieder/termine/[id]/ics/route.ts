import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  berlinClock,
  icsDatei,
  icsKopf,
  pushVevent,
  utcStamp,
} from "@/lib/ics";
import type { EventRow } from "@/lib/types";

// Einzelnen Termin als ICS-Datei herunterladen („In meinen Kalender“ auf
// der Termin-Detailseite). Läuft über die normale Anmeldung + RLS – wer den
// Termin nicht sehen darf, bekommt hier auch nichts.
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const event = (data as EventRow) ?? null;
  if (!event) {
    return NextResponse.json(
      { error: "Termin nicht gefunden." },
      { status: 404 },
    );
  }

  const allDay =
    !!event.time_tbd || berlinClock(event.starts_at) === "00:00";
  const description = [
    event.time_tbd ? "⏳ Genaue Uhrzeit folgt noch" : "",
    event.meet_home_time
      ? `🚌 Treffpunkt bei der TSG: ${event.meet_home_time} Uhr`
      : "",
    event.meet_venue_time
      ? `🤝 Treffpunkt vor Ort: ${event.meet_venue_time} Uhr`
      : "",
    event.description ?? "",
  ]
    .filter(Boolean)
    .join("\n");

  const stamp = utcStamp(new Date().toISOString());
  const lines = icsKopf("TSG 08 Roth Dart");
  pushVevent(lines, stamp, {
    uid: `event-${event.id}@tsg08roth-dart`,
    start: event.starts_at,
    end: event.ends_at,
    allDay,
    summary: event.title,
    location: event.location,
    description,
  });

  return new NextResponse(icsDatei(lines), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="termin.ics"',
      "Cache-Control": "no-store",
    },
  });
}
