"use client";

import { useState } from "react";
import Link from "next/link";
import type { SpielerZeile, VereinsSaison } from "@/lib/statistik";
import {
  bestenlisteFuerAnsicht,
  bestenlistenWerte,
  formatSiegquote,
  vergleicheBestenliste,
  type BestenlistenAnsicht,
} from "@/lib/bestenliste";

type SpaltenKey =
  | "name" | "punkte" | "spieltage" | "spiele" | "siege" | "niederlagen"
  | "einzel" | "doppel" | "quote" | "legs" | "m180" | "finish" | "lowdarts";

const ANSICHTEN: { key: BestenlistenAnsicht; label: string }[] = [
  { key: "gesamt", label: "Einzel & Doppel" },
  { key: "einzel", label: "Einzel" },
  { key: "doppel", label: "Doppel" },
];

const SPALTEN: {
  key: SpaltenKey;
  label: string;
  wert: (s: SpielerZeile, ansicht: BestenlistenAnsicht) => number | string | null;
  standard: "asc" | "desc";
}[] = [
  { key: "name", label: "Spieler", wert: (s) => s.anzeige, standard: "asc" },
  {
    key: "punkte", label: "Punkte", standard: "desc",
    wert: (s, a) => bestenlistenWerte(s, a).punkte,
  },
  {
    key: "legs", label: "Legs (Diff.)", standard: "desc",
    wert: (s, a) => bestenlistenWerte(s, a).legDifferenz,
  },
  {
    key: "quote", label: "Siegquote", standard: "desc",
    wert: (s, a) => bestenlistenWerte(s, a).siegquote,
  },
  { key: "spieltage", label: "Spieltage", wert: (s) => s.spieltage, standard: "desc" },
  {
    key: "spiele", label: "Spiele", standard: "desc",
    wert: (s, a) => bestenlistenWerte(s, a).spiele,
  },
  {
    key: "siege", label: "Siege", standard: "desc",
    wert: (s, a) => bestenlistenWerte(s, a).siege,
  },
  {
    key: "niederlagen", label: "Niederlagen", standard: "asc",
    wert: (s, a) => bestenlistenWerte(s, a).niederlagen,
  },
  { key: "einzel", label: "Einzel (S–N)", wert: (s) => s.einzelSiege, standard: "desc" },
  { key: "doppel", label: "Doppel (S–N)", wert: (s) => s.doppelSiege, standard: "desc" },
  { key: "m180", label: "180er", wert: (s) => s.anzahl180, standard: "desc" },
  { key: "finish", label: "Höchstes Highfinish", wert: (s) => s.besterFinish, standard: "desc" },
  { key: "lowdarts", label: "Kürzestes Leg", wert: (s) => s.besterLowDarts, standard: "asc" },
];

const GESAMT_SPALTEN: SpaltenKey[] = [
  "name", "punkte", "legs", "quote", "spieltage", "einzel", "doppel", "m180", "finish", "lowdarts",
];
const EINZEL_DOPPEL_SPALTEN: SpaltenKey[] = [
  "name", "punkte", "legs", "quote", "spiele", "siege", "niederlagen",
];
const ausgewaehlt = "bg-primary text-primary-fg";
const nichtAusgewaehlt = "border border-border text-muted hover:text-foreground";

export function Bestenliste({ saisons }: { saisons: VereinsSaison[] }) {
  const [sortKey, setSortKey] = useState<SpaltenKey>("punkte");
  const [richtung, setRichtung] = useState<"asc" | "desc">("desc");
  const [markiert, setMarkiert] = useState<Set<string>>(new Set());
  const [saisonIndex, setSaisonIndex] = useState(0);
  const [ansicht, setAnsicht] = useState<BestenlistenAnsicht>("gesamt");
  const liste = saisons[saisonIndex]?.liste ?? saisons[0]?.liste ?? [];
  const spaltenKeys = ansicht === "gesamt" ? GESAMT_SPALTEN : EINZEL_DOPPEL_SPALTEN;
  const spalten = spaltenKeys.map((key) => SPALTEN.find((s) => s.key === key)!);
  const spalte = SPALTEN.find((s) => s.key === sortKey)!;
  const sortiert = bestenlisteFuerAnsicht(liste, ansicht).sort((a, b) => {
    const wa = spalte.wert(a, ansicht);
    const wb = spalte.wert(b, ansicht);
    // Fehlende Werte auch bei aufsteigender Sortierung ans Ende.
    if (wa === null && wb !== null) return 1;
    if (wb === null && wa !== null) return -1;
    const diff = wa === null || wb === null ? 0
      : typeof wa === "string" || typeof wb === "string"
        ? String(wa).localeCompare(String(wb), "de")
        : wa - wb;
    return diff !== 0
      ? richtung === "asc" ? diff : -diff
      : vergleicheBestenliste(a, b, ansicht);
  });

  function markieren(name: string) {
    setMarkiert((alt) => {
      const neu = new Set(alt);
      if (neu.has(name)) neu.delete(name);
      else neu.add(name);
      return neu;
    });
  }

  function klick(key: SpaltenKey) {
    if (sortKey === key) {
      setRichtung(richtung === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setRichtung(SPALTEN.find((s) => s.key === key)?.standard ?? "desc");
    }
  }

  function wechsleAnsicht(key: BestenlistenAnsicht) {
    setAnsicht(key);
    setSortKey("punkte");
    setRichtung("desc");
  }

  function zellInhalt(s: SpielerZeile, key: SpaltenKey) {
    const werte = bestenlistenWerte(s, ansicht);
    switch (key) {
      case "name":
        return (
          <Link
            href={"/mitglieder/statistiken?spieler=" + encodeURIComponent(s.anzeige)}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-primary hover:underline"
          >
            {s.anzeige}
          </Link>
        );
      case "punkte": return <strong>{werte.punkte}</strong>;
      case "legs": return (
        <>
          <span>{werte.legsGewonnen}:{werte.legsVerloren}</span>
          <span className="block text-xs text-muted" title="Leg-Differenz">
            {werte.legDifferenz > 0 ? "+" : ""}{werte.legDifferenz}
          </span>
        </>
      );
      case "quote": return formatSiegquote(werte.siegquote);
      case "spieltage": return s.spieltage;
      case "spiele": return werte.spiele;
      case "siege": return werte.siege;
      case "niederlagen": return werte.niederlagen;
      case "einzel":
      case "doppel": return (
        <>
          <span>{key === "einzel" ? s.einzelSiege : s.doppelSiege}–{key === "einzel" ? s.einzelNiederlagen : s.doppelNiederlagen}</span>
          <span className="block text-xs text-muted">
            {formatSiegquote(bestenlistenWerte(s, key).siegquote)}
          </span>
        </>
      );
      case "m180": return s.anzahl180;
      case "finish": return s.besterFinish ?? "–";
      case "lowdarts": return s.besterLowDarts ?? "–";
    }
  }

  return (
    <div className="space-y-3">
      {saisons.length > 1 && (
        <div className="flex flex-wrap gap-2" aria-label="Saison auswählen">
          {saisons.map((s, i) => (
            <button
              key={s.label}
              type="button"
              aria-pressed={saisonIndex === i}
              onClick={() => setSaisonIndex(i)}
              className={"rounded-full px-3 py-1 text-sm font-medium " +
                (saisonIndex === i ? ausgewaehlt : nichtAusgewaehlt)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2" aria-label="Statistik auswählen">
        {ANSICHTEN.map((a) => (
          <button
            key={a.key}
            type="button"
            aria-pressed={ansicht === a.key}
            onClick={() => wechsleAnsicht(a.key)}
            className={"rounded-full px-3 py-1 text-sm font-medium " +
              (ansicht === a.key ? ausgewaehlt : nichtAusgewaehlt)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">
        Einzelsieg: 2 Punkte · Doppelsieg: 1 Punkt. Bei Punktgleichstand
        entscheidet die Leg-Differenz (gewonnene minus verlorene Legs).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-2 py-2">#</th>
              {spalten.map((s) => (
                <th
                  key={s.key}
                  className="px-2 py-2"
                  aria-sort={sortKey === s.key ? richtung === "asc" ? "ascending" : "descending" : "none"}
                >
                  <button
                    type="button"
                    onClick={() => klick(s.key)}
                    className={"max-w-24 whitespace-normal text-left uppercase tracking-wide hover:text-foreground " +
                      (sortKey === s.key ? "text-foreground" : "")}
                    title={"Nach " + s.label + " sortieren"}
                  >
                    {s.label}{sortKey === s.key ? richtung === "asc" ? " ▲" : " ▼" : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortiert.length === 0 ? (
              <tr>
                <td colSpan={spalten.length + 1} className="px-2 py-4 text-muted">
                  In dieser Auswahl sind noch keine Spiele erfasst.
                </td>
              </tr>
            ) : sortiert.map((s, i) => (
              <tr
                key={s.anzeige}
                onClick={() => markieren(s.anzeige)}
                className={"cursor-pointer border-b border-border/50 " +
                  (markiert.has(s.anzeige) ? "bg-primary/15 hover:bg-primary/20" : "hover:bg-border/20")}
              >
                <td className="px-2 py-2 text-muted">{markiert.has(s.anzeige) ? "📌" : String(i + 1) + "."}</td>
                {spalten.map((spalte) => <td key={spalte.key} className="px-2 py-2">{zellInhalt(s, spalte.key)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted">
        Siegquote = Siege / gespielte Partien der gewählten Ansicht.
        In „Einzel & Doppel“ stehen die Einzel- und Doppelquoten zusätzlich
        unter der jeweiligen Bilanz. Spaltenüberschrift antippen zum Sortieren;
        nochmal antippen kehrt die Richtung um. Zeile antippen markiert den
        Spieler 📌, der Name öffnet die Detail-Statistik.
      </p>
    </div>
  );
}
