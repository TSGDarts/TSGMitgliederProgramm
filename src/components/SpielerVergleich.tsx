"use client";

import { useState } from "react";
import type { SpielerZeile } from "@/lib/statistik";

// Spieler-Vergleich: Personen auswählen, Werte nebeneinander sehen –
// der beste Wert jeder Zeile wird grün hervorgehoben.

const METRIKEN: {
  label: string;
  wert: (s: SpielerZeile) => number | null;
  anzeige: (s: SpielerZeile) => string;
  besserIst: "hoch" | "tief";
}[] = [
  {
    label: "Spieltage",
    wert: (s) => s.spieltage,
    anzeige: (s) => String(s.spieltage),
    besserIst: "hoch",
  },
  {
    label: "Einzel (S–N)",
    wert: (s) => s.einzelSiege,
    anzeige: (s) => `${s.einzelSiege}–${s.einzelNiederlagen}`,
    besserIst: "hoch",
  },
  {
    label: "Doppel (S–N)",
    wert: (s) => s.doppelSiege,
    anzeige: (s) => `${s.doppelSiege}–${s.doppelNiederlagen}`,
    besserIst: "hoch",
  },
  {
    label: "Siegquote",
    wert: (s) => {
      const spiele =
        s.einzelSiege + s.einzelNiederlagen + s.doppelSiege + s.doppelNiederlagen;
      return spiele ? (s.einzelSiege + s.doppelSiege) / spiele : null;
    },
    anzeige: (s) => {
      const spiele =
        s.einzelSiege + s.einzelNiederlagen + s.doppelSiege + s.doppelNiederlagen;
      return spiele
        ? `${Math.round(((s.einzelSiege + s.doppelSiege) / spiele) * 100)} %`
        : "–";
    },
    besserIst: "hoch",
  },
  {
    label: "Legs",
    wert: (s) => s.legsGewonnen - s.legsVerloren,
    anzeige: (s) => `${s.legsGewonnen}:${s.legsVerloren}`,
    besserIst: "hoch",
  },
  {
    label: "180er",
    wert: (s) => s.anzahl180,
    anzeige: (s) => String(s.anzahl180),
    besserIst: "hoch",
  },
  {
    label: "Höchstes Highfinish",
    wert: (s) => s.besterFinish,
    anzeige: (s) => (s.besterFinish !== null ? String(s.besterFinish) : "–"),
    besserIst: "hoch",
  },
  {
    label: "Kürzestes Leg (Darts)",
    wert: (s) => s.besterLowDarts,
    anzeige: (s) => (s.besterLowDarts !== null ? String(s.besterLowDarts) : "–"),
    besserIst: "tief",
  },
];

export function SpielerVergleich({ liste }: { liste: SpielerZeile[] }) {
  const [namen, setNamen] = useState<string[]>([]);
  const [auswahl, setAuswahl] = useState("");

  const gewaehlt = namen
    .map((n) => liste.find((s) => s.anzeige === n))
    .filter((s): s is SpielerZeile => !!s);

  function hinzufuegen() {
    if (!auswahl || namen.includes(auswahl)) return;
    setNamen([...namen, auswahl]);
    setAuswahl("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={auswahl}
          onChange={(e) => setAuswahl(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary sm:max-w-xs"
        >
          <option value="">Spieler auswählen …</option>
          {liste
            .filter((s) => !namen.includes(s.anzeige))
            .map((s) => (
              <option key={s.anzeige} value={s.anzeige}>
                {s.anzeige}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={hinzufuegen}
          disabled={!auswahl}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40"
        >
          ➕ Vergleichen
        </button>
      </div>

      {gewaehlt.length === 0 ? (
        <p className="text-sm text-muted">
          Wähle oben zwei oder mehr Spieler aus – die Werte erscheinen dann
          nebeneinander, der beste Wert jeder Zeile wird grün markiert.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-2 py-2"></th>
                {gewaehlt.map((s) => (
                  <th key={s.anzeige} className="px-2 py-2">
                    <span className="inline-flex items-center gap-1 normal-case">
                      {s.anzeige}
                      <button
                        type="button"
                        onClick={() =>
                          setNamen(namen.filter((n) => n !== s.anzeige))
                        }
                        className="text-danger hover:opacity-70"
                        title="Aus dem Vergleich entfernen"
                      >
                        ✕
                      </button>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRIKEN.map((m) => {
                const werte = gewaehlt.map((s) => m.wert(s));
                const gueltige = werte.filter((w): w is number => w !== null);
                const bester =
                  gueltige.length === 0
                    ? null
                    : m.besserIst === "hoch"
                      ? Math.max(...gueltige)
                      : Math.min(...gueltige);
                return (
                  <tr key={m.label} className="border-b border-border/50">
                    <td className="px-2 py-2 font-medium">{m.label}</td>
                    {gewaehlt.map((s, i) => (
                      <td
                        key={s.anzeige}
                        className={`px-2 py-2 ${
                          bester !== null &&
                          werte[i] === bester &&
                          gewaehlt.length > 1
                            ? "font-bold text-ok"
                            : ""
                        }`}
                      >
                        {m.anzeige(s)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
