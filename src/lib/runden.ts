import type { EventRow } from "@/lib/types";
import { ergebnisTone } from "@/lib/format";

/** Team-Bilanz aus den Spielen mit Ergebnis (Siege-Unentschieden-Niederlagen). */
export function teamBilanz(spiele: EventRow[]) {
  const zaehle = (liste: EventRow[]) => {
    let s = 0;
    let u = 0;
    let n = 0;
    for (const ev of liste) {
      const r = (ev.result ?? "").trim();
      if (!r) continue;
      const t = ergebnisTone(r);
      if (t === "ok") s++;
      else if (t === "danger") n++;
      else u++;
    }
    return { s, u, n };
  };
  const gesamt = zaehle(spiele);
  const heim = zaehle(spiele.filter((ev) => ev.home_away === "heim"));
  const ausw = zaehle(spiele.filter((ev) => ev.home_away === "auswaerts"));
  // Aktuelle Serie (neueste zuerst): gleiche Ausgänge zählen
  let serie = 0;
  let serieArt: "ok" | "danger" | "neutral" | null = null;
  for (const ev of spiele) {
    const r = (ev.result ?? "").trim();
    if (!r) continue;
    const t = ergebnisTone(r);
    if (serieArt === null) serieArt = t;
    if (t !== serieArt) break;
    serie++;
  }
  const serieText =
    serie >= 2
      ? serieArt === "ok"
        ? `${serie} Siege in Folge 🔥`
        : serieArt === "danger"
          ? `${serie} Niederlagen in Folge`
          : `${serie}× unentschieden in Folge`
      : "";
  return { gesamt, heim, ausw, serieText };
}

/**
 * Punktspiele einer Saison in Hin- und Rückrunde teilen (erste Hälfte der
 * Spieltage = Hinrunde – Standard bei Hin-/Rückrunden-Ligen). Pokal- und
 * Freundschaftsspiele kommen separat.
 */
export function teileInRunden(spiele: EventRow[]): {
  hinrunde: EventRow[];
  rueckrunde: EventRow[];
  sonstige: EventRow[];
} {
  const liga = spiele
    .filter((s) => s.type === "match")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const sonstige = spiele
    .filter((s) => s.type !== "match")
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const haelfte = Math.ceil(liga.length / 2);
  return {
    hinrunde: liga.slice(0, haelfte),
    rueckrunde: liga.slice(haelfte),
    sonstige,
  };
}
