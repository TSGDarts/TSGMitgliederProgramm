import { normalizeOpponentName } from "./nuliga-opponents";
import { normalizeNuligaUrl } from "./nuliga-url";
import { parseSpielbericht } from "./spielbericht";

const ENDPOINT = /^\/(?:cgi-bin\/WebObjects\/nuLigaDARTDE\.woa|nuLigaDARTDE)\/wa\/(groupPage|teamPortrait|teamSchedule|groupMeetingReport)(?:\/view)?$/;
const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“",
  szlig: "ß", Auml: "Ä", Ouml: "Ö", Uuml: "Ü", auml: "ä", ouml: "ö", uuml: "ü",
  Agrave: "À", Aacute: "Á", Acirc: "Â", Atilde: "Ã", Aring: "Å", AElig: "Æ",
  Ccedil: "Ç", Egrave: "È", Eacute: "É", Ecirc: "Ê", Euml: "Ë", Igrave: "Ì",
  Iacute: "Í", Icirc: "Î", Iuml: "Ï", ETH: "Ð", Ntilde: "Ñ", Ograve: "Ò",
  Oacute: "Ó", Ocirc: "Ô", Otilde: "Õ", Oslash: "Ø", Ugrave: "Ù", Uacute: "Ú",
  Ucirc: "Û", Yacute: "Ý", THORN: "Þ", agrave: "à", aacute: "á", acirc: "â",
  atilde: "ã", aring: "å", aelig: "æ", ccedil: "ç", egrave: "è", eacute: "é",
  ecirc: "ê", euml: "ë", igrave: "ì", iacute: "í", icirc: "î", iuml: "ï",
  eth: "ð", ntilde: "ñ", ograve: "ò", oacute: "ó", ocirc: "ô", otilde: "õ",
  oslash: "ø", ugrave: "ù", uacute: "ú", ucirc: "û", yacute: "ý", thorn: "þ", yuml: "ÿ",
};

function decodeHtml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, key: string) => {
    if (!key.startsWith("#")) return ENTITIES[key] ?? entity;
    const code = /^#x/i.test(key) ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code)
      : "�";
  });
}

function cleanHtml(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "");
}

function cellParts(html: string): string[] {
  return html.split(/<br\b[^>]*>/i)
    .map((part) => decodeHtml(part.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function cellText(html: string): string {
  return cellParts(html).join(" ");
}

function cells(row: string, tag: "td" | "th"): string[] {
  return [...row.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
    .map((match) => match[1]);
}

function rows(table: string): string[] {
  return [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1]);
}

function isoDate(value: string): string | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null;
}

/** Nur die ausgeschriebene erste TSG-Mannschaft hat eine sichere Aliasform. */
function teamKey(name: string): string {
  const key = normalizeOpponentName(name);
  return key === "tsg 08 roth i" ? "tsg 08 roth" : key;
}

/** Öffentliche Liga-/Teamseite auf den Gesamtspielplan dieser Gruppe setzen. */
export function nuligaSpielplanUrl(rawUrl: string): string | null {
  const safe = normalizeNuligaUrl(decodeHtml(rawUrl));
  if (!safe) return null;
  const url = new URL(safe);
  const endpoint = ENDPOINT.exec(url.pathname)?.[1];
  if (!endpoint || endpoint === "groupMeetingReport" ||
    !/^\d+$/.test(url.searchParams.get("group") ?? "") ||
    !url.searchParams.get("championship")?.trim()) return null;
  url.pathname = url.pathname.replace(/(?:groupPage|teamPortrait|teamSchedule)(?:\/view)?$/, "groupPage");
  url.searchParams.delete("teamtable");
  url.searchParams.set("displayDetail", "meetings");
  url.searchParams.set("displayTyp", "gesamt");
  url.hash = "";
  return url.toString();
}

export interface NuligaBerichtLink {
  url: string;
  heim: string;
  gast: string;
  datum: string;
}

export interface NuligaErgebnis {
  heim: string;
  gast: string;
  datum: string;
  ergebnis: string;
  berichtUrl: string | null;
}

function berichtUrl(scoreCell: string, base: URL): string | null {
  const anchors = [...scoreCell.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  if (anchors.length !== 1 || cellText(anchors[0][2]) !== cellText(scoreCell)) return null;
  const hrefs = [...anchors[0][1].matchAll(/(?:^|\s)href\s*=\s*["']([^"']+)["']/gi)];
  if (hrefs.length !== 1) return null;
  let safe: string | null;
  try { safe = normalizeNuligaUrl(new URL(decodeHtml(hrefs[0][1]), base).toString()); }
  catch { return null; }
  if (!safe) return null;
  const url = new URL(safe);
  if (url.origin !== base.origin || ENDPOINT.exec(url.pathname)?.[1] !== "groupMeetingReport" ||
    !/^\d+$/.test(url.searchParams.get("meeting") ?? "") ||
    ["meeting", "group", "championship"].some((key) => url.searchParams.getAll(key).length !== 1) ||
    url.searchParams.get("group") !== base.searchParams.get("group") ||
    url.searchParams.get("championship") !== base.searchParams.get("championship")) return null;
  url.hash = "";
  return url.toString();
}

/** Veröffentlichte Ergebnisse aus Mannschaftssicht, auch ohne vollständigen Bericht. */
export function parseNuligaErgebnisse(html: string, baseUrl: string, teamName: string): NuligaErgebnis[] {
  const safeBase = nuligaSpielplanUrl(baseUrl);
  if (!safeBase || !teamName.trim()) return [];
  const base = new URL(safeBase);
  if (["group", "championship"].some((key) => base.searchParams.getAll(key).length !== 1)) return [];
  const wanted = teamKey(teamName);
  const result = new Map<string, NuligaErgebnis | null>();
  const ambiguousReports = new Set<string>();
  for (const table of cleanHtml(html).matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    let indices: { heim: number; gast: number; datum: number; score: number } | null = null;
    let datum: string | null = null;
    for (const row of rows(table[0])) {
      const header = cells(row, "th").map(cellText);
      if (header.length) {
        const candidate = {
          heim: header.findIndex((h) => /^Heimmannschaft$/i.test(h)),
          gast: header.findIndex((h) => /^Gastmannschaft$/i.test(h)),
          datum: header.findIndex((h) => /^(Date|Datum)$/i.test(h)),
          score: header.findIndex((h) => /^Spiele$/i.test(h)),
        };
        indices = Object.values(candidate).every((i) => i >= 0) ? candidate : null;
        datum = null;
        continue;
      }
      if (!indices) continue;
      const columns = cells(row, "td");
      const dateText = cellText(columns[indices.datum] ?? "");
      if (dateText) datum = isoDate(dateText);
      if (!datum) continue;
      const heim = cellText(columns[indices.heim] ?? "");
      const gast = cellText(columns[indices.gast] ?? "");
      const homeKey = teamKey(heim);
      const awayKey = teamKey(gast);
      if (!heim || !gast || homeKey === awayKey || (homeKey !== wanted && awayKey !== wanted)) continue;
      const scoreCell = columns[indices.score] ?? "";
      if (!/^\d+:\d+$/.test(cellText(scoreCell))) continue;
      const scores = cellText(scoreCell).split(":").map(Number);
      if (scores.some((score) => !Number.isSafeInteger(score)) || scores.every((score) => score === 0)) continue;
      const ergebnis = (homeKey === wanted ? scores : scores.slice().reverse()).join(":");
      const key = `${datum}|${homeKey}|${awayKey}`;
      const entry = { heim, gast, datum, ergebnis, berichtUrl: berichtUrl(scoreCell, base) };
      if (!result.has(key)) {
        result.set(key, entry);
      } else {
        const previous = result.get(key);
        if (previous && previous.ergebnis !== ergebnis) result.set(key, null);
        else if (previous && entry.berichtUrl && !ambiguousReports.has(key)) {
          if (previous.berichtUrl && new URL(previous.berichtUrl).searchParams.get("meeting") !==
            new URL(entry.berichtUrl).searchParams.get("meeting")) {
            previous.berichtUrl = null;
            ambiguousReports.add(key);
          } else previous.berichtUrl = entry.berichtUrl;
        }
      }
    }
  }
  return [...result.values()].filter((entry): entry is NuligaErgebnis => entry !== null);
}

/** Ergebnislinks nur für die genaue Mannschaft; leere Datumszellen erben den Tag. */
export function parseNuligaBerichtLinks(html: string, baseUrl: string, teamName: string): NuligaBerichtLink[] {
  const seen = new Set<string>();
  return parseNuligaErgebnisse(html, baseUrl, teamName).flatMap(({ berichtUrl, heim, gast, datum }) => {
    if (!berichtUrl) return [];
    const url = new URL(berichtUrl);
    const key = `${url.searchParams.get("championship")}|${url.searchParams.get("group")}|${url.searchParams.get("meeting")}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ url: berichtUrl, heim, gast, datum }];
  });
}

/** Vollständige HTML-Berichte ins bestehende, aus TSG-Sicht gedrehte Format lesen. */
export function parseNuligaSpielberichtHtml(
  html: string,
  erwarteteBegegnung?: Pick<NuligaBerichtLink, "heim" | "gast" | "datum">,
): ReturnType<typeof parseSpielbericht> {
  const source = cleanHtml(html);
  const fail = (fehler: string): ReturnType<typeof parseSpielbericht> => ({ ok: false, fehler });
  const headings = [...source.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)]
    .flatMap((match) => cellParts(match[1]));
  const heading = headings.find((h) => /^.+?\s+-\s+.+?\s*,\s*\d{2}\.\d{2}\.\d{4}/.test(h));
  const meeting = heading?.match(/^(.+?)\s+-\s+(.+?)\s*,\s*(\d{2}\.\d{2}\.\d{4})/);
  if (!meeting || !isoDate(meeting[3])) return fail("Begegnung oder Spieldatum fehlt im nuLiga-Bericht.");
  if (erwarteteBegegnung && (
    teamKey(meeting[1]) !== teamKey(erwarteteBegegnung.heim) ||
    teamKey(meeting[2]) !== teamKey(erwarteteBegegnung.gast) ||
    isoDate(meeting[3]) !== erwarteteBegegnung.datum
  )) return fail("nuLiga-Bericht gehört nicht zur erwarteten Begegnung oder zum erwarteten Spieldatum.");

  const text = [heading!];
  let matchTables = 0;
  let matches = 0;
  let total: number[] | null = null;
  const summed = [0, 0, 0, 0]; // Heim-/Gast-Legs, Heim-/Gast-Spiele
  let achievementHeading = "";
  for (const block of source.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>|<table\b[^>]*>[\s\S]*?<\/table>/gi)) {
    if (block[1] !== undefined) {
      achievementHeading = cellText(block[1]);
      continue;
    }
    const tableRows = rows(block[0]);
    const header = tableRows.flatMap((r) => cells(r, "th").map(cellText));
    const isMatchTable = header.includes("1. Satz") && header.includes("Sätze") && header.includes("Spiele");
    if (isMatchTable) {
      matchTables++;
      for (const row of tableRows) {
        const columns = cells(row, "td");
        if (!columns.length) continue;
        const values = columns.map(cellText);
        if (columns.length === 1 && !values[0] && /\bcolspan\s*=\s*["']?\d+/i.test(row)) continue;
        if (values.some((v) => /^Legs:\s*\d+:\d+$/.test(v))) {
          if (total) return fail("Mehrere Endergebnisse im nuLiga-Bericht.");
          const scores = values.filter((v) => /^(?:Legs:\s*)?\d+:\d+$/.test(v)).map((v) => v.replace(/^Legs:\s*/, ""));
          if (scores.length !== 3 || scores[1] !== scores[2]) return fail("Endergebnis im nuLiga-Bericht ist unvollständig.");
          total = [...scores[0].split(":"), ...scores[2].split(":")].map(Number);
          text.push(`Legs:\t${scores.join("\t")}`);
          continue;
        }
        if (!/^D?\d+-D?\d+$/.test(values[0])) return fail("Unbekannte Spielzeile im nuLiga-Bericht.");
        const isDouble = /^D/.test(values[0]);
        const homeNames = cellParts(columns[1] ?? "");
        const awayNames = cellParts(columns[2] ?? "");
        const scores = values.slice(3);
        if (columns.length !== 6 || homeNames.length !== (isDouble ? 2 : 1) ||
          awayNames.length !== (isDouble ? 2 : 1) ||
          [...homeNames, ...awayNames].some((n) => !/^[^\d:].*,\s*\S/.test(n)) ||
          scores.some((s) => !/^\d+:\d+$/.test(s)) ||
          !/^(1:0|0:1)$/.test(scores[2]) || scores[1] !== scores[2]
        ) return fail("nuLiga-Bericht enthält ungespielte oder unvollständige Spiele.");
        const [homeLegs, awayLegs] = scores[0].split(":").map(Number);
        const [homeWin, awayWin] = scores[2].split(":").map(Number);
        if (homeLegs === awayLegs || (homeLegs > awayLegs) !== (homeWin > awayWin)) {
          return fail("Legs und Spielgewinner im nuLiga-Bericht passen nicht zusammen.");
        }
        summed[0] += homeLegs;
        summed[1] += awayLegs;
        summed[2] += homeWin;
        summed[3] += awayWin;
        matches++;
        text.push([values[0], ...homeNames, ...awayNames, ...scores].join("\t"));
      }
    } else if (/^Bestleistungen (180er|High Finishes|Low Darts)$/i.test(achievementHeading)) {
      text.push(achievementHeading);
      for (const row of tableRows) {
        const columns = cells(row, "td");
        if (!columns.length) continue;
        const values = columns.map(cellText);
        const names = cellParts(columns[2] ?? "");
        if (columns.length !== 4 || !/^[1-9]\d*$/.test(values[0]) || !/^[1-9]\d*$/.test(values[1]) || !values[3] ||
          !names.length || names.some((n) => !/^[^\d:].*,\s*\S/.test(n))) {
          return fail("Bestleistungen im nuLiga-Bericht sind unvollständig.");
        }
        for (const name of names) {
          text.push([values[0], values[1], name, values[3]].join("\t"));
        }
      }
    }
  }
  if (matchTables !== 1 || !matches || !total || total.some((n, i) => n !== summed[i])) {
    return fail("nuLiga-Bericht ist unvollständig oder seine Endsumme passt nicht zu den Spielen.");
  }
  const parsed = parseSpielbericht(text.join("\n"));
  if (parsed.ok && (parsed.bericht.uebersprungen || parsed.bericht.spiele.length !== matches)) {
    return fail("Nicht alle Spiele des nuLiga-Berichts konnten vollständig gelesen werden.");
  }
  return parsed;
}
