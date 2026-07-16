import { createClient } from "@/lib/supabase/server";
import {
  alsMatchStats,
  normalisiereName,
  type Spielbericht,
} from "@/lib/spielbericht";
import { ergebnisTone } from "@/lib/format";

// Liga-Statistik eines Mitglieds: automatisch zusammengezählt aus allen
// eingespielten nuLiga-Spielberichten (events.match_stats) – inklusive
// Einzelnachweisen je Kachel (welcher Spieltag, gegen wen, Ergebnis).

export interface StatistikEintrag {
  eventId: string;
  datum: string; // ISO (starts_at)
  titel: string; // Begegnung (Termin-Titel)
  text: string; // z. B. "vs Rose, Felix · 3:0"
  tone: "ok" | "danger" | "neutral";
}

export interface LigaStatistik {
  spieltage: number;
  einzelSiege: number;
  einzelNiederlagen: number;
  doppelSiege: number;
  doppelNiederlagen: number;
  legsGewonnen: number;
  legsVerloren: number;
  anzahl180: number;
  besterFinish: number | null; // höchster High Finish
  besterLowDarts: number | null; // wenigste Darts für ein Leg
  details: {
    spieltage: StatistikEintrag[];
    einzel: StatistikEintrag[];
    doppel: StatistikEintrag[];
    legs: StatistikEintrag[];
    m180: StatistikEintrag[];
    finish: StatistikEintrag[];
    lowdarts: StatistikEintrag[];
  };
}

type EventZeile = {
  id: string;
  title: string;
  starts_at: string;
  result: string | null;
  match_stats: unknown;
};

/** Statistik + Einzelnachweise aus einer Menge von Spieltagen berechnen. */
function aggregiere(rows: EventZeile[], ich: string): LigaStatistik {
  const stat: LigaStatistik = {
    spieltage: 0,
    einzelSiege: 0,
    einzelNiederlagen: 0,
    doppelSiege: 0,
    doppelNiederlagen: 0,
    legsGewonnen: 0,
    legsVerloren: 0,
    anzahl180: 0,
    besterFinish: null,
    besterLowDarts: null,
    details: {
      spieltage: [],
      einzel: [],
      doppel: [],
      legs: [],
      m180: [],
      finish: [],
      lowdarts: [],
    },
  };
  if (!ich) return stat;

  for (const row of rows) {
    const stats = alsMatchStats(row.match_stats);
    const bericht: Spielbericht | undefined = stats?.nuliga;
    if (!bericht?.spiele) continue;

    const eintrag = (text: string, tone: StatistikEintrag["tone"]) => ({
      eventId: row.id as string,
      datum: row.starts_at as string,
      titel: row.title as string,
      text,
      tone,
    });

    let siege = 0;
    let niederlagen = 0;
    for (const s of bericht.spiele) {
      if (!s.unsere.some((n) => normalisiereName(n) === ich)) continue;
      const tone: StatistikEintrag["tone"] = s.gewonnen ? "ok" : "danger";
      if (s.gewonnen) siege++;
      else niederlagen++;
      if (s.doppel) {
        if (s.gewonnen) stat.doppelSiege++;
        else stat.doppelNiederlagen++;
        const partner = s.unsere
          .filter((n) => normalisiereName(n) !== ich)
          .join(" & ");
        stat.details.doppel.push(
          eintrag(
            `${partner ? `mit ${partner} ` : ""}vs ${s.gegner.join(" & ")} · ${s.legs}`,
            tone,
          ),
        );
      } else {
        if (s.gewonnen) stat.einzelSiege++;
        else stat.einzelNiederlagen++;
        stat.details.einzel.push(
          eintrag(`vs ${s.gegner.join(" & ")} · ${s.legs}`, tone),
        );
      }
      const [a, b] = s.legs.split(":").map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        stat.legsGewonnen += a;
        stat.legsVerloren += b;
        stat.details.legs.push(
          eintrag(
            `${s.doppel ? "Doppel" : "Einzel"} vs ${s.gegner.join(" & ")} · Legs ${s.legs}`,
            tone,
          ),
        );
      }
    }
    if (siege + niederlagen > 0) {
      stat.spieltage++;
      const gesamt = ((row.result as string) ?? "").trim() || bericht.ergebnis;
      stat.details.spieltage.push(
        eintrag(
          `${gesamt} · meine Bilanz ${siege}-${niederlagen}`,
          ergebnisTone(gesamt),
        ),
      );
    }

    for (const b of bericht.bestleistungen ?? []) {
      if (normalisiereName(b.name) !== ich) continue;
      if (b.kategorie === "180") {
        stat.anzahl180 += b.anzahl;
        stat.details.m180.push(
          eintrag(b.anzahl > 1 ? `${b.anzahl}× 180` : "180", "ok"),
        );
      } else if (b.kategorie === "highfinish") {
        if (stat.besterFinish === null || b.wert > stat.besterFinish) {
          stat.besterFinish = b.wert;
        }
        stat.details.finish.push(
          eintrag(
            `${b.wert}er Finish${b.anzahl > 1 ? ` (${b.anzahl}×)` : ""}`,
            "ok",
          ),
        );
      } else if (b.kategorie === "lowdarts") {
        if (stat.besterLowDarts === null || b.wert < stat.besterLowDarts) {
          stat.besterLowDarts = b.wert;
        }
        stat.details.lowdarts.push(
          eintrag(
            `Leg in ${b.wert} Darts${b.anzahl > 1 ? ` (${b.anzahl}×)` : ""}`,
            "ok",
          ),
        );
      }
    }
  }

  // Überall: Neuestes zuerst
  const nachDatum = (a: StatistikEintrag, b: StatistikEintrag) =>
    b.datum.localeCompare(a.datum);
  for (const liste of Object.values(stat.details)) {
    liste.sort(nachDatum);
  }
  return stat;
}

export interface SaisonStatistik {
  label: string; // "Gesamt" oder Saison-Name
  statistik: LigaStatistik;
}

/**
 * Liga-Statistik eines Mitglieds: „Gesamt“ plus je Saison (nur Saisons,
 * in denen die Person auch gespielt hat). Zuordnung über den
 * Saison-Zeitraum (starts_on/ends_on).
 */
export async function sammleLigaStatistikSaisons(
  fullName: string,
): Promise<SaisonStatistik[]> {
  const ich = normalisiereName(fullName);
  const supabase = await createClient();
  const [{ data: eventData }, { data: saisonData }] = await Promise.all([
    supabase
      .from("events")
      .select("id, title, starts_at, result, match_stats")
      .not("match_stats", "is", null),
    supabase
      .from("seasons")
      .select("name, starts_on, ends_on")
      .order("created_at", { ascending: false }),
  ]);
  const rows = (eventData as EventZeile[]) ?? [];

  const ergebnis: SaisonStatistik[] = [
    { label: "Gesamt", statistik: aggregiere(rows, ich) },
  ];
  for (const s of saisonData ?? []) {
    const inSaison = rows.filter((r) => {
      const tag = r.starts_at.slice(0, 10);
      if (s.starts_on && tag < (s.starts_on as string)) return false;
      if (s.ends_on && tag > (s.ends_on as string)) return false;
      return true;
    });
    const statistik = aggregiere(inSaison, ich);
    if (statistik.spieltage > 0) {
      ergebnis.push({ label: s.name as string, statistik });
    }
  }
  return ergebnis;
}
