"use client";

import { useState } from "react";
import Link from "next/link";
import type { SpielerZeile } from "@/lib/statistik";

// Vereins-Bestenliste: Klick auf eine Spaltenüberschrift sortiert danach
// (nochmal klicken dreht die Richtung um). Standard: Siege gesamt.

type SpaltenKey =
  | "name"
  | "spieltage"
  | "einzel"
  | "doppel"
  | "legs"
  | "m180"
  | "finish"
  | "lowdarts";

const SPALTEN: {
  key: SpaltenKey;
  label: string;
  wert: (s: SpielerZeile) => number | string | null;
  standard: "asc" | "desc";
}[] = [
  { key: "name", label: "Spieler", wert: (s) => s.anzeige, standard: "asc" },
  {
    key: "spieltage",
    label: "Spieltage",
    wert: (s) => s.spieltage,
    standard: "desc",
  },
  {
    key: "einzel",
    label: "Einzel",
    wert: (s) => s.einzelSiege,
    standard: "desc",
  },
  {
    key: "doppel",
    label: "Doppel",
    wert: (s) => s.doppelSiege,
    standard: "desc",
  },
  {
    key: "legs",
    label: "Legs",
    wert: (s) => s.legsGewonnen - s.legsVerloren,
    standard: "desc",
  },
  { key: "m180", label: "180er", wert: (s) => s.anzahl180, standard: "desc" },
  {
    key: "finish",
    label: "Höchstes Highfinish",
    wert: (s) => s.besterFinish,
    standard: "desc",
  },
  {
    key: "lowdarts",
    label: "Kürzestes Leg",
    wert: (s) => s.besterLowDarts,
    standard: "asc",
  },
];

export function Bestenliste({ liste }: { liste: SpielerZeile[] }) {
  const [sortKey, setSortKey] = useState<SpaltenKey | null>(null);
  const [richtung, setRichtung] = useState<"asc" | "desc">("desc");

  const spalte = SPALTEN.find((s) => s.key === sortKey) ?? null;
  const sortiert = spalte
    ? [...liste].sort((a, b) => {
        const wa = spalte.wert(a);
        const wb = spalte.wert(b);
        // Fehlende Werte immer ans Ende
        if (wa === null && wb === null) return 0;
        if (wa === null) return 1;
        if (wb === null) return -1;
        let diff: number;
        if (typeof wa === "string" || typeof wb === "string") {
          diff = String(wa).localeCompare(String(wb));
        } else {
          diff = wa - wb;
        }
        return richtung === "asc" ? diff : -diff;
      })
    : liste; // Standard: Siege gesamt (kommt so vom Server)

  function klick(key: SpaltenKey) {
    if (sortKey === key) {
      setRichtung(richtung === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setRichtung(SPALTEN.find((s) => s.key === key)?.standard ?? "desc");
    }
  }

  const pfeil = (key: SpaltenKey) =>
    sortKey === key ? (richtung === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-2 py-2">#</th>
            {SPALTEN.map((s) => (
              <th key={s.key} className="px-2 py-2">
                <button
                  type="button"
                  onClick={() => klick(s.key)}
                  className={`uppercase tracking-wide hover:text-foreground ${
                    sortKey === s.key ? "text-foreground" : ""
                  }`}
                  title={`Nach ${s.label} sortieren`}
                >
                  {s.label}
                  {pfeil(s.key)}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortiert.map((s, i) => (
            <tr
              key={s.anzeige}
              className="border-b border-border/50 hover:bg-border/20"
            >
              <td className="px-2 py-2 text-muted">{i + 1}.</td>
              <td className="px-2 py-2 font-medium">
                <Link
                  href={`/mitglieder/statistiken?spieler=${encodeURIComponent(s.anzeige)}`}
                  className="text-primary hover:underline"
                >
                  {s.anzeige}
                </Link>
              </td>
              <td className="px-2 py-2">{s.spieltage}</td>
              <td className="px-2 py-2">
                {s.einzelSiege}–{s.einzelNiederlagen}
              </td>
              <td className="px-2 py-2">
                {s.doppelSiege}–{s.doppelNiederlagen}
              </td>
              <td className="px-2 py-2">
                {s.legsGewonnen}:{s.legsVerloren}
              </td>
              <td className="px-2 py-2">{s.anzahl180}</td>
              <td className="px-2 py-2">{s.besterFinish ?? "–"}</td>
              <td className="px-2 py-2">{s.besterLowDarts ?? "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        Spaltenüberschrift antippen zum Sortieren (nochmal = Richtung
        umdrehen). Ohne Auswahl: sortiert nach Siegen (Einzel + Doppel).
      </p>
    </div>
  );
}
