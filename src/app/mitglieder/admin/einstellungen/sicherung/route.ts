import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { erzeugeZip, type ZipEintrag } from "@/lib/zip-write";

// Daten-Sicherung zum Herunterladen (nur Admins): alle wichtigen Tabellen
// als eine ZIP-Datei – je Tabelle eine Excel-taugliche CSV-Datei, dazu eine
// vollständige JSON-Datei für eine spätere Wiederherstellung.
//
// BEWUSST NICHT enthalten: secure_settings (Zugangsdaten/Geheimnisse),
// push_subscriptions (Geräteschlüssel), notification_log (nur Protokoll)
// und die Dateien aus den Speicher-Buckets (Flyer, Kassen-Belege).
export const dynamic = "force-dynamic";

const TABELLEN = [
  "profiles",
  "member_invites",
  "teams",
  "team_members",
  "events",
  "event_invitees",
  "event_carpool",
  "event_helpers",
  "event_lineups",
  "rsvps",
  "opponents",
  "tournaments",
  "competitions",
  "competition_modes",
  "competition_dates",
  "seasons",
  "survey_responses",
  "survey_responses_invites",
  "season_team_archive",
  "season_plans",
  "pokal_squads",
  "app_settings",
  "announcements",
  "polls",
  "poll_votes",
  "questions",
  "answers",
  "kasse_import",
  "kasse_buchung",
  "kasse_beleg",
  "kasse_auslage",
] as const;

type Zeile = Record<string, unknown>;

// Primärschlüssel-Spalten je Tabelle: Die Paginierung braucht eine STABILE
// Sortierung, sonst können bei >1000 Zeilen Duplikate/Lücken entstehen
// (Postgres garantiert ohne ORDER BY keine Reihenfolge). Tabellen ohne
// id-Spalte haben zusammengesetzte Schlüssel.
const SORTIERUNG: Record<string, string[]> = {
  team_members: ["team_id", "profile_id"],
  event_invitees: ["event_id", "profile_id"],
  event_carpool: ["event_id", "profile_id"],
  event_helpers: ["event_id", "profile_id"],
  event_lineups: ["event_id"],
  rsvps: ["event_id", "profile_id"],
  survey_responses: ["season_id", "profile_id"],
  survey_responses_invites: ["season_id", "invite_id"],
  poll_votes: ["poll_id", "profile_id"],
  app_settings: ["key"],
  competition_dates: ["date"],
};

/** Alle Zeilen einer Tabelle laden (in 1000er-Blöcken, Supabase-Limit). */
async function ladeTabelle(
  admin: ReturnType<typeof createAdminSupabase>,
  tabelle: string,
): Promise<{ zeilen: Zeile[]; fehler: string | null; fehltNoch: boolean }> {
  const zeilen: Zeile[] = [];
  const BLOCK = 1000;
  for (let von = 0; ; von += BLOCK) {
    let query = admin.from(tabelle).select("*");
    for (const spalte of SORTIERUNG[tabelle] ?? ["id"]) {
      query = query.order(spalte, { ascending: true });
    }
    const { data, error } = await query.range(von, von + BLOCK - 1);
    if (error) {
      // Unterscheiden: Tabelle existiert noch nicht (SQL-Skript fehlt)
      // vs. vorübergehender Datenbank-Fehler
      const fehltNoch = /does not exist|relation|schema cache/i.test(
        error.message,
      );
      return { zeilen, fehler: error.message, fehltNoch };
    }
    zeilen.push(...((data as Zeile[]) ?? []));
    if (!data || data.length < BLOCK) break;
  }
  return { zeilen, fehler: null, fehltNoch: false };
}

/** Einen Wert für die CSV-Zelle aufbereiten (Excel: Semikolon-Trennung). */
function csvZelle(wert: unknown): string {
  if (wert === null || wert === undefined) return "";
  let text = typeof wert === "object" ? JSON.stringify(wert) : String(wert);
  // Formel-Schutz: Texte, die mit = + - @ Tab beginnen, würde Excel als
  // Formel ausführen (Freitexte kommen u. a. aus Bank-Verwendungszwecken
  // und Mitglieder-Kommentaren). Hochkomma davor = Excel zeigt nur Text.
  if (typeof wert === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = "'" + text;
  }
  if (/[";\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Tabelle als CSV (mit BOM, Semikolon – öffnet sauber in Excel). */
function alsCsv(zeilen: Zeile[]): string {
  // Spalten: Vereinigung aller vorkommenden Schlüssel (stabile Reihenfolge)
  const spalten: string[] = [];
  for (const z of zeilen) {
    for (const key of Object.keys(z)) {
      if (!spalten.includes(key)) spalten.push(key);
    }
  }
  const kopf = spalten.map(csvZelle).join(";");
  const koerper = zeilen.map((z) =>
    spalten.map((s) => csvZelle(z[s])).join(";"),
  );
  // \uFEFF = BOM, damit Excel Umlaute korrekt liest (wie beim Saison-Export)
  return "\uFEFF" + [kopf, ...koerper].join("\r\n") + "\r\n";
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !profile.is_active || profile.role !== "admin") {
    return NextResponse.json({ error: "Nur für Admins." }, { status: 403 });
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json(
      { error: "Nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY fehlt)." },
      { status: 503 },
    );
  }

  const jetzt = new Date();
  const berlinDay = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(jetzt);

  const eintraege: ZipEintrag[] = [];
  const json: Record<string, Zeile[]> = {};
  // Zwei Fehlerarten getrennt: Tabelle existiert noch nicht (SQL-Skript
  // fehlt – Sicherung trotzdem vollständig) vs. echter Lesefehler
  // (Sicherung UNVOLLSTÄNDIG – deutlich markieren!)
  const fehlendeSkripte: string[] = [];
  const leseFehler: string[] = [];
  let zeilenGesamt = 0;

  for (const tabelle of TABELLEN) {
    const { zeilen, fehler, fehltNoch } = await ladeTabelle(admin, tabelle);
    if (fehler) {
      if (fehltNoch) {
        fehlendeSkripte.push(`${tabelle}: ${fehler}`);
      } else {
        leseFehler.push(`${tabelle}: ${fehler}`);
      }
      continue;
    }
    json[tabelle] = zeilen;
    zeilenGesamt += zeilen.length;
    eintraege.push({
      name: `tabellen/${tabelle}.csv`,
      inhalt: alsCsv(zeilen),
    });
  }

  eintraege.push({
    name: "sicherung.json",
    inhalt: JSON.stringify(
      { exportiert_am: jetzt.toISOString(), tabellen: json },
      null,
      1,
    ),
  });

  eintraege.unshift({
    name: "LIESMICH.txt",
    inhalt: [
      `Daten-Sicherung der TSG 08 Roth Dart Mitglieder-App`,
      `Erstellt am: ${berlinDay} (${jetzt.toISOString()})`,
      `Tabellen: ${Object.keys(json).length} · Zeilen gesamt: ${zeilenGesamt}`,
      ``,
      `Inhalt:`,
      `- tabellen/*.csv  – je Tabelle eine Datei, öffnet direkt in Excel`,
      `- sicherung.json  – alle Daten vollständig (für eine Wiederherstellung`,
      `                    in Supabase durch eine fachkundige Person)`,
      ``,
      `NICHT enthalten (bitte wissen):`,
      `- Hochgeladene Dateien aus den Speicher-Buckets (Turnier-Flyer,`,
      `  Kassen-Belege) – die liegen nur in Supabase Storage.`,
      `- Geheime Zugangsdaten (secure_settings) und Push-Geräteschlüssel.`,
      `- Passwörter der Mitglieder (liegen nur verschlüsselt bei Supabase).`,
      ``,
      `WICHTIG: Diese Datei enthält persönliche Daten (Namen, Geburtstage,`,
      `Handynummern, Kassendaten) sowie den Beitritts-Link-Token`,
      `(app_settings). Bitte nur an einem geschützten Ort ablegen.`,
      ...(fehlendeSkripte.length
        ? [
            ``,
            `Noch nicht vorhandene Tabellen (zugehöriges SQL-Skript wurde`,
            `noch nicht ausgeführt – dort gibt es auch noch keine Daten):`,
            ...fehlendeSkripte.map((p) => `- ${p}`),
          ]
        : []),
      ``,
    ].join("\r\n"),
  });

  // Echte Lesefehler: Sicherung deutlich als unvollständig kennzeichnen –
  // im Dateinamen UND als erste Datei im Archiv (still fehlende Kern-Daten
  // wären bei einer Sicherung der schlimmste Fall)
  if (leseFehler.length) {
    eintraege.unshift({
      name: "ACHTUNG-UNVOLLSTAENDIG.txt",
      inhalt: [
        `ACHTUNG: Diese Sicherung ist UNVOLLSTÄNDIG!`,
        ``,
        `Beim Lesen folgender Tabellen trat ein (vermutlich vorübergehender)`,
        `Datenbank-Fehler auf – sie fehlen in dieser Sicherung ganz oder`,
        `teilweise. Bitte die Sicherung einfach erneut herunterladen:`,
        ``,
        ...leseFehler.map((p) => `- ${p}`),
        ``,
      ].join("\r\n"),
    });
  }
  const suffix = leseFehler.length ? "-UNVOLLSTAENDIG" : "";

  const zip = erzeugeZip(eintraege, jetzt);
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="TSG-Dart-Sicherung-${berlinDay}${suffix}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
