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

export interface GegnerBilanzZeile {
  anzeige: string; // "Vorname Nachname"
  siege: number;
  niederlagen: number;
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
  gegner: GegnerBilanzZeile[]; // Einzel-Bilanz je gegnerischem Spieler
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
    gegner: [],
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

  // Einzel-Bilanz je gegnerischem Spieler (Angst-/Lieblingsgegner)
  const gegnerMap = new Map<string, GegnerBilanzZeile>();

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
        for (const g of s.gegner) {
          const key = normalisiereName(g);
          const e =
            gegnerMap.get(key) ??
            ({ anzeige: anzeigeName(g), siege: 0, niederlagen: 0 });
          if (s.gewonnen) e.siege++;
          else e.niederlagen++;
          gegnerMap.set(key, e);
        }
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
  // Gegner: die häufigsten Duelle zuerst
  stat.gegner = [...gegnerMap.values()].sort(
    (a, b) =>
      b.siege + b.niederlagen - (a.siege + a.niederlagen) ||
      a.anzeige.localeCompare(b.anzeige),
  );
  return stat;
}

export interface SaisonStatistik {
  label: string; // "Gesamt" oder Saison-Name
  statistik: LigaStatistik;
}

/** "Nachname, Vorname" → "Vorname Nachname" (für die Anzeige). */
export function anzeigeName(n: string): string {
  const teile = n.split(",");
  return teile.length === 2 ? `${teile[1].trim()} ${teile[0].trim()}` : n.trim();
}

export interface SpielerZeile {
  anzeige: string; // "Vorname Nachname"
  spieltage: number;
  einzelSiege: number;
  einzelNiederlagen: number;
  doppelSiege: number;
  doppelNiederlagen: number;
  legsGewonnen: number;
  legsVerloren: number;
  anzahl180: number;
  besterFinish: number | null;
  besterLowDarts: number | null;
}

/**
 * Vereinsweite Bestenliste aus einer Menge von Spieltagen: alle
 * TSG-Spieler, sortiert nach Siegen (Einzel + Doppel).
 */
export function vereinsAggregat(rows: EventZeile[]): SpielerZeile[] {
  const spieler = new Map<string, SpielerZeile & { key: string }>();
  const hole = (name: string) => {
    const key = normalisiereName(name);
    const e =
      spieler.get(key) ??
      ({
        key,
        anzeige: anzeigeName(name),
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
      } as SpielerZeile & { key: string });
    spieler.set(key, e);
    return e;
  };

  for (const row of rows) {
    const stats = alsMatchStats(row.match_stats);
    const bericht = stats?.nuliga;
    if (!bericht?.spiele) continue;

    const dabei = new Set<string>();
    for (const s of bericht.spiele) {
      for (const name of s.unsere) {
        const e = hole(name);
        dabei.add(e.key);
        if (s.doppel) {
          if (s.gewonnen) e.doppelSiege++;
          else e.doppelNiederlagen++;
        } else {
          if (s.gewonnen) e.einzelSiege++;
          else e.einzelNiederlagen++;
        }
        const [a, b] = s.legs.split(":").map(Number);
        if (Number.isFinite(a) && Number.isFinite(b)) {
          e.legsGewonnen += a;
          e.legsVerloren += b;
        }
      }
    }
    for (const key of dabei) {
      spieler.get(key)!.spieltage++;
    }

    // Bestleistungen zählen nur für unsere Spieler (Gegner ignorieren)
    for (const b of bericht.bestleistungen ?? []) {
      const key = normalisiereName(b.name);
      const e = spieler.get(key);
      if (!e || !dabei.has(key)) continue;
      if (b.kategorie === "180") e.anzahl180 += b.anzahl;
      else if (b.kategorie === "highfinish") {
        if (e.besterFinish === null || b.wert > e.besterFinish) {
          e.besterFinish = b.wert;
        }
      } else if (b.kategorie === "lowdarts") {
        if (e.besterLowDarts === null || b.wert < e.besterLowDarts) {
          e.besterLowDarts = b.wert;
        }
      }
    }
  }

  return [...spieler.values()].sort(
    (a, b) =>
      b.einzelSiege + b.doppelSiege - (a.einzelSiege + a.doppelSiege) ||
      a.anzeige.localeCompare(b.anzeige),
  );
}

export interface VereinsSaison {
  label: string; // "Gesamt" oder Saison-Name
  liste: SpielerZeile[];
}

/**
 * Vereins-Bestenliste: „Gesamt“ plus je Saison (Zuordnung über den
 * Saison-Zeitraum; Saisons ohne erfasste Spiele erscheinen nicht).
 */
export async function sammleVereinsStatistikSaisons(): Promise<VereinsSaison[]> {
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

  const ergebnis: VereinsSaison[] = [
    { label: "Gesamt", liste: vereinsAggregat(rows) },
  ];
  for (const s of saisonData ?? []) {
    const inSaison = rows.filter((r) => {
      const tag = r.starts_at.slice(0, 10);
      if (s.starts_on && tag < (s.starts_on as string)) return false;
      if (s.ends_on && tag > (s.ends_on as string)) return false;
      return true;
    });
    const liste = vereinsAggregat(inSaison);
    if (liste.length > 0) {
      ergebnis.push({ label: s.name as string, liste });
    }
  }
  return ergebnis;
}

export interface DoppelPaarZeile {
  anzeige: string; // "A & B"
  siege: number;
  niederlagen: number;
  legsGewonnen: number;
  legsVerloren: number;
}

/** Bilanz aller TSG-Doppelpaarungen aus den eingespielten Spielberichten. */
export function doppelPaare(rows: EventZeile[]): DoppelPaarZeile[] {
  const paare = new Map<string, DoppelPaarZeile>();
  for (const row of rows) {
    const stats = alsMatchStats(row.match_stats);
    const bericht = stats?.nuliga;
    if (!bericht?.spiele) continue;
    for (const s of bericht.spiele) {
      if (!s.doppel || s.unsere.length !== 2) continue;
      const key = s.unsere.map(normalisiereName).sort().join("|");
      const e =
        paare.get(key) ??
        ({
          anzeige: s.unsere
            .map(anzeigeName)
            .sort((a, b) => a.localeCompare(b))
            .join(" & "),
          siege: 0,
          niederlagen: 0,
          legsGewonnen: 0,
          legsVerloren: 0,
        } as DoppelPaarZeile);
      if (s.gewonnen) e.siege++;
      else e.niederlagen++;
      const [a, b] = s.legs.split(":").map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        e.legsGewonnen += a;
        e.legsVerloren += b;
      }
      paare.set(key, e);
    }
  }
  return [...paare.values()].sort(
    (x, y) =>
      y.siege - x.siege ||
      x.niederlagen - y.niederlagen ||
      x.anzeige.localeCompare(y.anzeige),
  );
}

export interface DoppelSaison {
  label: string; // "Gesamt" oder Saison-Name
  liste: DoppelPaarZeile[];
}

/**
 * Doppel-Paare-Bilanz: „Gesamt“ plus je Saison (Zuordnung über den
 * Saison-Zeitraum; Saisons ohne erfasste Doppel erscheinen nicht).
 */
export async function sammleDoppelPaareSaisons(): Promise<DoppelSaison[]> {
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

  const ergebnis: DoppelSaison[] = [
    { label: "Gesamt", liste: doppelPaare(rows) },
  ];
  for (const s of saisonData ?? []) {
    const inSaison = rows.filter((r) => {
      const tag = r.starts_at.slice(0, 10);
      if (s.starts_on && tag < (s.starts_on as string)) return false;
      if (s.ends_on && tag > (s.ends_on as string)) return false;
      return true;
    });
    const liste = doppelPaare(inSaison);
    if (liste.length > 0) {
      ergebnis.push({ label: s.name as string, liste });
    }
  }
  return ergebnis;
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
