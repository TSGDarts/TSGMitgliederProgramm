// nuLiga-Tabelle (BDV) aus der öffentlichen groupPage auslesen.
// Aufbau der Tabelle (erste <table class="result-set">): je Zeile
//   [Status-Icon] Rang | Team | Begegnungen | S | U | N | Spiele | +/- | Legs | Punkte

export interface TabellenZeile {
  rang: string;
  team: string;
  begegnungen: string;
  s: string;
  u: string;
  n: string;
  spiele: string; // z. B. "194:94"
  diff: string; // z. B. "+100"
  legs: string; // z. B. "685:466"
  punkte: string; // z. B. "30:2"
  status: "" | "Aufsteiger" | "Absteiger";
}

export interface NuligaTabelle {
  titel: string; // z. B. "2. Bezirksliga A"
  zeilen: TabellenZeile[];
}

function entdecke(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&auml;/g, "ä")
    .replace(/&ouml;/g, "ö")
    .replace(/&uuml;/g, "ü")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&szlig;/g, "ß")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNuligaTabelle(html: string): NuligaTabelle {
  // erste Ergebnistabelle herausschneiden
  const start = html.search(/<table[^>]*class="result-set"/i);
  if (start < 0) return { titel: "", zeilen: [] };
  const end = html.indexOf("</table>", start);
  const tabelle = html.slice(start, end < 0 ? undefined : end);

  const zeilen: TabellenZeile[] = [];
  for (const tr of tabelle.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = tr[1];
    if (/<th[\s>]/i.test(row)) continue; // Kopfzeile

    const status: TabellenZeile["status"] = /alt="Aufsteiger"/i.test(row)
      ? "Aufsteiger"
      : /alt="Absteiger"/i.test(row)
        ? "Absteiger"
        : "";

    // Teamname: aus dem Portrait-Link, sonst aus der nowrap-Zelle
    const linkTreffer = row.match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
    const team = linkTreffer ? entdecke(linkTreffer[1]) : "";

    // zentrierte Werte-Zellen der Reihe nach
    const werte = [...row.matchAll(/<td[^>]*align="center"[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => entdecke(m[1]),
    );
    if (werte.length < 2 || !team) continue;

    // Standard-Layout (9 Werte). Bei Abweichung Rang/Punkte als Minimum.
    if (werte.length >= 9) {
      zeilen.push({
        rang: werte[0],
        team,
        begegnungen: werte[1],
        s: werte[2],
        u: werte[3],
        n: werte[4],
        spiele: werte[5],
        diff: werte[6],
        legs: werte[7],
        punkte: werte[8],
        status,
      });
    } else {
      zeilen.push({
        rang: werte[0] ?? "",
        team,
        begegnungen: "",
        s: "",
        u: "",
        n: "",
        spiele: "",
        diff: "",
        legs: "",
        punkte: werte[werte.length - 1] ?? "",
        status,
      });
    }
  }

  // Liga-Titel (z. B. "2. Bezirksliga A")
  let titel = "";
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) titel = entdecke(h1[1]);

  return { titel, zeilen };
}

/**
 * nuLiga-Tabelle laden (serverseitig, mit Timeout + Cache). Bei Fehler null.
 */
export async function ladeNuligaTabelle(
  url: string,
): Promise<NuligaTabelle | null> {
  const sauber = url.trim().replace(/^webcal:\/\//i, "https://");
  if (!/^https?:\/\//i.test(sauber)) return null;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(sauber, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (TSG-Dart-App)" },
      next: { revalidate: 1800 }, // 30 Min zwischenspeichern
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const tabelle = parseNuligaTabelle(html);
    return tabelle.zeilen.length > 0 ? tabelle : null;
  } catch {
    return null;
  }
}
