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
export function spielerBilanz(bericht: {
  spiele: Pick<BerichtSpiel, "unsere" | "gewonnen">[];
}): { name: string; siege: number; niederlagen: number }[] {
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

// ===================== 3K Darts (Heimspiele) =====================
// Der Admin kopiert die drei Ansichten der 3K-Software (Spiele,
// Bestleistungen, Statistiken) jeweils komplett und fügt sie ein.

export interface DreiKSpiel {
  nr: number;
  doppel: boolean;
  unsere: string[];
  gegner: string[];
  unserAvg: number | null;
  gegnerAvg: number | null;
  legs: string; // aus unserer Sicht, z. B. "3:1"
  gewonnen: boolean;
}

export interface DreiKBericht {
  heim: string;
  gast: string;
  wirSindHeim: boolean;
  ergebnis: string; // aus unserer Sicht, z. B. "12:6"
  legsGesamt: string;
  gesamtAvg: string; // z. B. "59.9"
  spiele: DreiKSpiel[];
  bestleistungen?: {
    kategorie: string; // "180" | "Highfinish" | "Shortgame" | "Shortgame Doppel"
    name: string;
    anzahl: number;
    wert: number;
  }[];
  statistiken?: { name: string; avg: number }[];
}

/** Gesamter Spielbericht eines Termins (JSONB events.match_stats). */
export interface MatchStats {
  quelle?: "" | "3k" | "darthelfer";
  nuliga?: Spielbericht;
  dreik?: DreiKBericht;
}

/** Altbestand (Spielbericht direkt gespeichert) in die neue Form heben. */
export function alsMatchStats(roh: unknown): MatchStats | null {
  if (!roh || typeof roh !== "object") return null;
  const o = roh as Record<string, unknown>;
  if (Array.isArray(o.spiele) && !o.nuliga && !o.dreik) {
    return { nuliga: roh as Spielbericht };
  }
  return roh as MatchStats;
}

/** Spiele-Ansicht der 3K-Software auslesen (Strg+A/Strg+C der Seite). */
export function parseDreiKSpiele(
  roh: string,
):
  | { ok: true; bericht: DreiKBericht }
  | { ok: false; fehler: string } {
  const zeilen = roh
    .replace(/ /g, " ")
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean);

  // Kopf: "TSG 08 Roth vs. Dartdragons Moosbach"
  let heim = "";
  let gast = "";
  for (const z of zeilen) {
    const m = z.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
    if (m) {
      heim = m[1].trim();
      gast = m[2].trim();
      break;
    }
  }
  if (!heim || !gast) {
    return { ok: false, fehler: "Begegnung („… vs. …“) nicht gefunden." };
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

  // Gesamt: "12-6 (43-30)" und "Gesamt-Average: Ø 59.9"
  let ergebnisHeim = "";
  let legsHeim = "";
  let gesamtAvg = "";
  for (const z of zeilen) {
    const g = z.match(/^(\d+)-(\d+)\s*\((\d+)-(\d+)\)$/);
    if (g && !ergebnisHeim) {
      ergebnisHeim = `${g[1]}:${g[2]}`;
      legsHeim = `${g[3]}:${g[4]}`;
    }
    const a = z.match(/Gesamt-Average:\s*Ø?\s*([\d.,]+)/i);
    if (a && !gesamtAvg) gesamtAvg = a[1];
  }

  // Spiele: Zeilenfolge  <Nr> [<Board>] <Name> (Avg) <a-b> <Name> (Avg)
  const istZahl = (z: string) => /^\d+$/.test(z);
  const istAvg = (z: string) => /^\((\d+([.,]\d+)?)\)$/.test(z);
  const istErgebnis = (z: string) => /^\d+-\d+$/.test(z);
  const istNameZeile = (z: string) =>
    !istZahl(z) && !istAvg(z) && !istErgebnis(z) && /[A-Za-zÄÖÜäöüß]/.test(z) &&
    !/:/.test(z) && !/^#/.test(z) && !/Logo/i.test(z);
  const avgWert = (z: string) =>
    Number(z.replace(/[()]/g, "").replace(",", ".")) || null;

  const spiele: DreiKSpiel[] = [];
  for (let i = 0; i < zeilen.length; i++) {
    if (!istZahl(zeilen[i])) continue;
    let j = i + 1;
    if (j < zeilen.length && istZahl(zeilen[j])) j++; // Board-Nummer
    if (
      j + 3 < zeilen.length &&
      istNameZeile(zeilen[j]) &&
      istAvg(zeilen[j + 1]) &&
      istErgebnis(zeilen[j + 2]) &&
      istNameZeile(zeilen[j + 3])
    ) {
      const nameHeim = zeilen[j];
      const heimAvg = avgWert(zeilen[j + 1]);
      const [a, b] = zeilen[j + 2].split("-").map(Number);
      const nameGast = zeilen[j + 3];
      const gastAvg =
        j + 4 < zeilen.length && istAvg(zeilen[j + 4])
          ? avgWert(zeilen[j + 4])
          : null;
      const heimNamen = nameHeim.split(/\s*&\s*/);
      const gastNamen = nameGast.split(/\s*&\s*/);
      spiele.push({
        nr: Number(zeilen[i]),
        doppel: heimNamen.length > 1 || gastNamen.length > 1,
        unsere: wirSindHeim ? heimNamen : gastNamen,
        gegner: wirSindHeim ? gastNamen : heimNamen,
        unserAvg: wirSindHeim ? heimAvg : gastAvg,
        gegnerAvg: wirSindHeim ? gastAvg : heimAvg,
        legs: wirSindHeim ? `${a}:${b}` : `${b}:${a}`,
        gewonnen: wirSindHeim ? a > b : b > a,
      });
      i = j + (gastAvg !== null ? 4 : 3);
    }
  }
  if (spiele.length === 0) {
    return {
      ok: false,
      fehler:
        "Keine Spiele gefunden – bitte die komplette 3K-Spiele-Ansicht kopieren.",
    };
  }
  if (!ergebnisHeim) {
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
      legsGesamt: dreh(legsHeim, !wirSindHeim),
      gesamtAvg,
      spiele,
    },
  };
}

/** Bestleistungen-Ansicht der 3K-Software (180er, Highfinish, Shortgame). */
export function parseDreiKBestleistungen(
  roh: string,
): { kategorie: string; name: string; anzahl: number; wert: number }[] {
  const zeilen = roh.replace(/ /g, " ").split(/\r?\n/);
  const eintraege: { kategorie: string; name: string; anzahl: number; wert: number }[] = [];
  let kategorie = "";
  for (const zeile of zeilen) {
    const z = zeile.trim();
    if (/^Highscore/i.test(z)) kategorie = "180";
    else if (/^Highfinish/i.test(z)) kategorie = "Highfinish";
    else if (/^Shortgame Doppel/i.test(z)) kategorie = "Shortgame Doppel";
    else if (/^Shortgame/i.test(z)) kategorie = "Shortgame";
    if (!kategorie) continue;
    const tokens = zeile
      .split(/\t| {2,}/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (tokens.length < 3 || tokens[0] === "Name") continue;
    const anzahl = Number(tokens[tokens.length - 2]);
    const wert = Number(tokens[tokens.length - 1]);
    const name = tokens.slice(0, tokens.length - 2).join(" ");
    if (!Number.isFinite(anzahl) || !Number.isFinite(wert) || !name) continue;
    eintraege.push({ kategorie, name, anzahl, wert });
  }
  return eintraege;
}

/** Statistik-Ansicht der 3K-Software: Match-Average je Spieler/Doppel. */
export function parseDreiKStatistiken(
  roh: string,
): { name: string; avg: number }[] {
  const zeilen = roh
    .replace(/ /g, " ")
    .split(/\r?\n/)
    .map((z) => z.trim());
  const eintraege: { name: string; avg: number }[] = [];
  for (let i = 0; i < zeilen.length; i++) {
    if (!/^\d+\.$/.test(zeilen[i])) continue;
    // nächste nicht-leere Zeile = Name, danach die Zeile mit dem Ø-Wert
    let j = i + 1;
    while (j < zeilen.length && !zeilen[j]) j++;
    const name = zeilen[j];
    let k = j + 1;
    while (k < zeilen.length && !/Ø\s*[\d.,]+/.test(zeilen[k])) {
      if (/^\d+\.$/.test(zeilen[k])) break;
      k++;
    }
    const m = k < zeilen.length ? zeilen[k].match(/Ø\s*([\d.,]+)/) : null;
    if (name && m) {
      eintraege.push({ name, avg: Number(m[1].replace(",", ".")) });
      i = k;
    }
  }
  return eintraege;
}
