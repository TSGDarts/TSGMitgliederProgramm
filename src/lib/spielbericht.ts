// nuLiga-Spielbericht auslesen: Der Admin kopiert die komplette
// Spielbericht-Seite (Strg+A, Strg+C) und fügt sie in der App ein.
// Hier wird daraus die Begegnung samt aller Einzel/Doppel gelesen und
// alles auf UNSERE Sicht gedreht (Grundlage für die Spielerstatistik).

export interface BerichtSpiel {
  nr: string; // z. B. "1-1" oder "D1-D1"
  doppel: boolean;
  unsere: string[]; // 1 (Einzel) oder 2 (Doppel) Namen "Nachname, Vorname"
  gegner: string[];
  legs: string; // 1. Satz aus unserer Sicht, z. B. "3:0"
  gewonnen: boolean;
}

export interface Spielbericht {
  heim: string;
  gast: string;
  wirSindHeim: boolean;
  ergebnis: string; // Spiele gesamt aus unserer Sicht, z. B. "12:6"
  legsGesamt: string; // aus unserer Sicht
  spiele: BerichtSpiel[];
  uebersprungen: number; // unvollständige Zeilen (z. B. kampflos)
}

const istScore = (t: string) => /^\d+:\d+$/.test(t);
const istName = (t: string) => /^[^\d:].*,\s*\S/.test(t) && !/:\s*$/.test(t);

function dreh(score: string, drehen: boolean): string {
  if (!drehen) return score;
  const [a, b] = score.split(":");
  return `${b}:${a}`;
}

export function parseSpielbericht(
  roh: string,
):
  | { ok: true; bericht: Spielbericht }
  | { ok: false; fehler: string } {
  const text = roh.replace(/ /g, " ");
  const zeilen = text.split(/\r?\n/);

  // Kopfzeile: "Heim - Gast , TT.MM.JJJJ, HH:MM Uhr"
  let heim = "";
  let gast = "";
  for (const z of zeilen) {
    const m = z.match(/^(.+?)\s+-\s+(.+?)\s*,\s*\d{2}\.\d{2}\.\d{4}/);
    if (m) {
      heim = m[1].trim();
      gast = m[2].trim();
      break;
    }
  }
  if (!heim || !gast) {
    return {
      ok: false,
      fehler:
        "Begegnung nicht gefunden – bitte die KOMPLETTE nuLiga-Spielbericht-Seite kopieren (Strg+A, Strg+C).",
    };
  }
  const heimIstTsg = /tsg/i.test(heim);
  const gastIstTsg = /tsg/i.test(gast);
  if (heimIstTsg === gastIstTsg) {
    return {
      ok: false,
      fehler: `Konnte nicht erkennen, welche Seite wir sind („${heim}“ gegen „${gast}“).`,
    };
  }
  const wirSindHeim = heimIstTsg;

  // Spielzeilen einsammeln: eine Zeile beginnt mit "1-1" / "D1-D1" und ist
  // komplett, sobald drei Ergebnis-Spalten (Legs, Sätze, Spiele) da sind.
  // Doppel verteilen sich beim Kopieren auf mehrere Zeilen.
  const zeilenTokens = (z: string) =>
    z
      .split(/\t| {2,}/)
      .map((t) => t.trim())
      .filter(Boolean);
  const spieleRoh: string[][] = [];
  let aktuelle: string[] | null = null;
  for (const zeile of zeilen) {
    const tokens = zeilenTokens(zeile);
    if (tokens.length === 0) continue;
    if (/^D?\d+-D?\d+$/.test(tokens[0])) {
      aktuelle = [...tokens];
    } else if (aktuelle) {
      aktuelle.push(...tokens);
    } else {
      continue;
    }
    if (aktuelle.filter(istScore).length >= 3) {
      spieleRoh.push(aktuelle);
      aktuelle = null;
    }
  }

  const spiele: BerichtSpiel[] = [];
  let uebersprungen = 0;
  for (const row of spieleRoh) {
    const nr = row[0];
    const doppel = /^D/i.test(nr);
    const scores = row.filter(istScore);
    const namen = row.slice(1).filter((t) => !istScore(t) && istName(t));
    const erwartet = doppel ? 4 : 2;
    if (namen.length !== erwartet || scores.length < 3) {
      uebersprungen++;
      continue;
    }
    const heimNamen = doppel ? [namen[0], namen[1]] : [namen[0]];
    const gastNamen = doppel ? [namen[2], namen[3]] : [namen[1]];
    // Spalten: 1. Satz (Legs), Sätze, Spiele – jeweils aus Heim-Sicht
    const legs = scores[scores.length - 3];
    const spieleScore = scores[scores.length - 1];
    const [h, g] = spieleScore.split(":").map(Number);
    spiele.push({
      nr,
      doppel,
      unsere: wirSindHeim ? heimNamen : gastNamen,
      gegner: wirSindHeim ? gastNamen : heimNamen,
      legs: dreh(legs, !wirSindHeim),
      gewonnen: wirSindHeim ? h > g : g > h,
    });
  }
  if (spiele.length === 0) {
    return {
      ok: false,
      fehler:
        "Keine Einzel/Doppel gefunden – bitte die komplette Spielbericht-Seite kopieren.",
    };
  }

  // Gesamtzeile: " Legs: 29:41  6:12  6:12" → Legs gesamt + Spiele gesamt
  let legsGesamt = "";
  let ergebnisHeim = "";
  for (const zeile of zeilen) {
    if (!/Legs:/.test(zeile)) continue;
    const scores = zeile.split(/[\t\s]+/).filter(istScore);
    if (scores.length >= 2) {
      legsGesamt = scores[0];
      ergebnisHeim = scores[scores.length - 1];
    }
    break;
  }
  if (!ergebnisHeim) {
    // Notlösung: aus den Einzel-Ergebnissen zusammenzählen
    const siege = spiele.filter((s) => s.gewonnen).length;
    ergebnisHeim = wirSindHeim
      ? `${siege}:${spiele.length - siege}`
      : `${spiele.length - siege}:${siege}`;
  }

  return {
    ok: true,
    bericht: {
      heim,
      gast,
      wirSindHeim,
      ergebnis: dreh(ergebnisHeim, !wirSindHeim),
      legsGesamt: dreh(legsGesamt, !wirSindHeim),
      spiele,
      uebersprungen,
    },
  };
}

/** Bilanz je TSG-Spieler (Einzel + Doppel zusammen) aus einem Bericht. */
export function spielerBilanz(
  bericht: Spielbericht,
): { name: string; siege: number; niederlagen: number }[] {
  const map = new Map<string, { name: string; siege: number; niederlagen: number }>();
  for (const s of bericht.spiele) {
    for (const name of s.unsere) {
      const e = map.get(name) ?? { name, siege: 0, niederlagen: 0 };
      if (s.gewonnen) e.siege++;
      else e.niederlagen++;
      map.set(name, e);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
