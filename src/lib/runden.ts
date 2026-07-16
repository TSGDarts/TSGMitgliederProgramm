import type { EventRow } from "@/lib/types";

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
