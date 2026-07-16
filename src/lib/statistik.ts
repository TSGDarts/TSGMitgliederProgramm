import { createClient } from "@/lib/supabase/server";
import {
  alsMatchStats,
  normalisiereName,
  type Spielbericht,
} from "@/lib/spielbericht";

// Liga-Statistik eines Mitglieds: automatisch zusammengezählt aus allen
// eingespielten nuLiga-Spielberichten (events.match_stats).

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
}

export async function sammleLigaStatistik(
  fullName: string,
): Promise<LigaStatistik> {
  const leer: LigaStatistik = {
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
  };
  const ich = normalisiereName(fullName);
  if (!ich) return leer;

  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("match_stats")
    .not("match_stats", "is", null);

  const stat = { ...leer };
  for (const row of data ?? []) {
    const stats = alsMatchStats(row.match_stats);
    const bericht: Spielbericht | undefined = stats?.nuliga;
    if (!bericht?.spiele) continue;

    let dabei = false;
    for (const s of bericht.spiele) {
      if (!s.unsere.some((n) => normalisiereName(n) === ich)) continue;
      dabei = true;
      if (s.doppel) {
        if (s.gewonnen) stat.doppelSiege++;
        else stat.doppelNiederlagen++;
      } else {
        if (s.gewonnen) stat.einzelSiege++;
        else stat.einzelNiederlagen++;
      }
      const [a, b] = s.legs.split(":").map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) {
        stat.legsGewonnen += a;
        stat.legsVerloren += b;
      }
    }
    if (dabei) stat.spieltage++;

    for (const b of bericht.bestleistungen ?? []) {
      if (normalisiereName(b.name) !== ich) continue;
      if (b.kategorie === "180") {
        stat.anzahl180 += b.anzahl;
      } else if (b.kategorie === "highfinish") {
        if (stat.besterFinish === null || b.wert > stat.besterFinish) {
          stat.besterFinish = b.wert;
        }
      } else if (b.kategorie === "lowdarts") {
        if (stat.besterLowDarts === null || b.wert < stat.besterLowDarts) {
          stat.besterLowDarts = b.wert;
        }
      }
    }
  }
  return stat;
}
