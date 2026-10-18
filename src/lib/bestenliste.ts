import type { SpielerZeile } from "@/lib/statistik";

export type BestenlistenAnsicht = "gesamt" | "einzel" | "doppel";

/** Punkte werden gewichtet; die Siegquote zählt jede Partie einmal. */
export function bestenlistenWerte(
  spieler: SpielerZeile,
  ansicht: BestenlistenAnsicht = "gesamt",
) {
  const einzel = ansicht !== "doppel";
  const doppel = ansicht !== "einzel";
  const einzelSiege = einzel ? spieler.einzelSiege : 0;
  const doppelSiege = doppel ? spieler.doppelSiege : 0;
  const siege = einzelSiege + doppelSiege;
  const niederlagen = (einzel ? spieler.einzelNiederlagen : 0)
    + (doppel ? spieler.doppelNiederlagen : 0);
  const spiele = siege + niederlagen;
  const legsGewonnen = ansicht === "einzel"
    ? spieler.einzelLegsGewonnen
    : ansicht === "doppel" ? spieler.doppelLegsGewonnen : spieler.legsGewonnen;
  const legsVerloren = ansicht === "einzel"
    ? spieler.einzelLegsVerloren
    : ansicht === "doppel" ? spieler.doppelLegsVerloren : spieler.legsVerloren;

  return {
    siege,
    niederlagen,
    spiele,
    punkte: 2 * einzelSiege + doppelSiege,
    siegquote: spiele > 0 ? (siege / spiele) * 100 : null,
    legsGewonnen,
    legsVerloren,
    legDifferenz: legsGewonnen - legsVerloren,
  };
}

/** Einzel/Doppel zeigen nur Spieler mit einer Partie in dieser Disziplin. */
export function bestenlisteFuerAnsicht(
  liste: readonly SpielerZeile[],
  ansicht: BestenlistenAnsicht = "gesamt",
): SpielerZeile[] {
  return ansicht === "gesamt"
    ? [...liste]
    : liste.filter((spieler) => bestenlistenWerte(spieler, ansicht).spiele > 0);
}

/** Standardrangfolge: Punkte, Leg-Differenz, anschließend der Name. */
export function vergleicheBestenliste(
  a: SpielerZeile,
  b: SpielerZeile,
  ansicht: BestenlistenAnsicht = "gesamt",
): number {
  const werteA = bestenlistenWerte(a, ansicht);
  const werteB = bestenlistenWerte(b, ansicht);
  return werteB.punkte - werteA.punkte
    || werteB.legDifferenz - werteA.legDifferenz
    || a.anzeige.localeCompare(b.anzeige, "de");
}

const quoteFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function formatSiegquote(siegquote: number | null): string {
  return siegquote === null ? "–" : `${quoteFormat.format(siegquote)} %`;
}
