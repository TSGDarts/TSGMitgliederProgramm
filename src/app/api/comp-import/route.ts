import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";

// Importiert Vereinsmeisterschaft + Finalturnier/Playoffs aus der öffentlichen
// Competition-Seite (GitHub Pages). Diese ZWEI Termine werden in der
// Competition-App gepflegt (Gegenrichtung zum dart-feed) und hier in den
// Terminkalender übernommen. Läuft täglich per Vercel-Cron (vercel.json),
// kann aber auch jederzeit von Hand aufgerufen werden.
// Idempotent: legt an / aktualisiert / entfernt NUR Einträge mit
// source_uid "comp-app:…" – alle anderen Termine bleiben unberührt.
export const dynamic = "force-dynamic";

const QUELLE = "https://tsgdarts.github.io/CompetitionRangliste-Setzliste/";

const berlinDatum = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const berlinUhr = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  hour: "2-digit",
  minute: "2-digit",
});

// Mitternacht Europe/Berlin als ISO-Zeitpunkt (Sommer-/Winterzeit korrekt)
function berlinMidnightIso(datum: string): string {
  for (const off of ["+02:00", "+01:00"]) {
    const d = new Date(`${datum}T00:00:00${off}`);
    if (berlinDatum.format(d) === datum && berlinUhr.format(d) === "00:00") {
      return d.toISOString();
    }
  }
  return new Date(`${datum}T00:00:00+01:00`).toISOString();
}

interface CompEvent {
  uid?: string;
  datum?: string;
  text?: string;
}

export async function GET() {
  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json({ error: "Nicht konfiguriert." }, { status: 503 });
  }

  // Öffentliche Seite laden – der Datenblock steht ganz am Anfang des <body>,
  // deshalb reicht normalerweise ein Teilabruf (Range); sonst komplette Seite.
  let html = "";
  try {
    const r = await fetch(QUELLE, {
      cache: "no-store",
      headers: { Range: "bytes=0-262143" },
    });
    if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
    html = await r.text();
    if (!html.includes("compEventsFuerMitgliederApp")) {
      const voll = await fetch(QUELLE, { cache: "no-store" });
      if (!voll.ok) throw new Error(`HTTP ${voll.status}`);
      html = await voll.text();
    }
  } catch {
    return NextResponse.json(
      { error: "Competition-Seite nicht erreichbar." },
      { status: 502 },
    );
  }

  const m = html.match(
    /<script type="application\/json" id="compEventsFuerMitgliederApp">([\s\S]*?)<\/script>/,
  );
  // Kein Datenblock (Seite noch nicht neu veröffentlicht)? Dann trotzdem weitermachen –
  // die Competition-Abende (competition_dates) werden unabhängig davon gespiegelt.
  let hinweis: string | undefined;
  let events: CompEvent[] = [];
  if (!m) {
    hinweis =
      "Kein VM/Finalturnier-Datenblock gefunden – die Competition-Seite wurde vermutlich noch nicht neu veröffentlicht.";
  } else {
    try {
      events = JSON.parse(m[1]).events ?? [];
    } catch {
      hinweis = "Datenblock unlesbar – VM/Finalturnier übersprungen.";
    }
  }

  const gueltig = events.filter(
    (e) =>
      e &&
      typeof e.uid === "string" &&
      e.uid.startsWith("comp-app:") &&
      typeof e.datum === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(e.datum) &&
      (e.text ?? "").trim(),
  );

  // Zusätzlich: unsere eigenen Competition-Abende (competition_dates) in den
  // Terminkalender spiegeln – so erscheinen sie in Kalender & Termin-Listen.
  const { data: compDates } = await admin
    .from("competition_dates")
    .select("date, nr");
  for (const c of compDates ?? []) {
    if (!c.date) continue;
    gueltig.push({
      uid: `comp-app:cd-${c.date}`,
      datum: c.date as string,
      text: c.nr != null ? `🎯 Competition ${c.nr}` : "🎯 Competition",
    });
  }

  const { data: vorhanden } = await admin
    .from("events")
    .select("id, source_uid, title, starts_at")
    .like("source_uid", "comp-app:%");
  const byUid = new Map((vorhanden ?? []).map((e) => [e.source_uid as string, e]));

  let neu = 0;
  let aktualisiert = 0;
  let entfernt = 0;
  for (const e of gueltig) {
    const starts = berlinMidnightIso(e.datum as string);
    const title = (e.text as string).trim();
    const alt = byUid.get(e.uid as string);
    if (!alt) {
      await admin.from("events").insert({
        team_id: null,
        title,
        type: "other",
        starts_at: starts,
        is_public: true,
        source: "manual",
        source_uid: e.uid,
        time_tbd: true, // Uhrzeit pflegt die Competition-App nicht mit → „Uhrzeit folgt"
        feed_export: false, // nie zurück in den dart-feed (käme sonst doppelt in der Competition-App an)
      });
      neu++;
    } else if (
      alt.title !== title ||
      new Date(alt.starts_at as string).toISOString() !== starts
    ) {
      await admin
        .from("events")
        .update({ title, starts_at: starts })
        .eq("id", alt.id);
      aktualisiert++;
    }
    byUid.delete(e.uid as string);
  }
  // Übrig gebliebene comp-app-Einträge gibt es in der Competition-App nicht mehr.
  // VM/Finalturnier (nicht "cd-") aber NUR aufräumen, wenn der Datenblock wirklich
  // gelesen wurde – sonst würde eine noch nicht veröffentlichte Seite sie löschen.
  const blockOk = !!m && !hinweis;
  for (const rest of byUid.values()) {
    const uid = (rest.source_uid as string) || "";
    if (!uid.startsWith("comp-app:cd-") && !blockOk) continue;
    await admin.from("events").delete().eq("id", rest.id);
    entfernt++;
  }

  return NextResponse.json({
    quelle: QUELLE,
    ...(hinweis ? { hinweis } : {}),
    gefunden: gueltig.length,
    neu,
    aktualisiert,
    entfernt,
  });
}
