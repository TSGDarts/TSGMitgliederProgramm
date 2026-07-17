"use client";

import { useState } from "react";
import type { DoppelSaison } from "@/lib/statistik";

/**
 * Doppel-Paare-Bilanz: welches TSG-Doppel harmoniert am besten? Aus den
 * eingespielten nuLiga-Spielberichten, mit Saison-Auswahl.
 */
export function DoppelPaare({ saisons }: { saisons: DoppelSaison[] }) {
  const [saisonIndex, setSaisonIndex] = useState(0);
  const liste = saisons[saisonIndex]?.liste ?? saisons[0].liste;

  return (
    <div className="space-y-3">
      {saisons.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {saisons.map((s, i) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setSaisonIndex(i)}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                saisonIndex === i
                  ? "bg-primary text-primary-fg"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Doppel</th>
              <th className="px-2 py-2 text-right">Spiele</th>
              <th className="px-2 py-2 text-right">S–N</th>
              <th className="px-2 py-2 text-right">Legs</th>
              <th className="px-2 py-2 text-right">Quote</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((p, i) => {
              const spiele = p.siege + p.niederlagen;
              const quote = spiele > 0 ? Math.round((p.siege / spiele) * 100) : 0;
              const tone =
                p.siege > p.niederlagen
                  ? "text-ok"
                  : p.siege < p.niederlagen
                    ? "text-danger"
                    : "text-muted";
              return (
                <tr key={p.anzeige} className="border-b border-border/50">
                  <td className="px-2 py-1.5 text-muted">
                    {i === 0 && p.siege > 0 ? "🥇" : i + 1}
                  </td>
                  <td className="px-2 py-1.5 font-medium">{p.anzeige}</td>
                  <td className="px-2 py-1.5 text-right">{spiele}</td>
                  <td className={`px-2 py-1.5 text-right font-medium ${tone}`}>
                    {p.siege}–{p.niederlagen}
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted">
                    {p.legsGewonnen}:{p.legsVerloren}
                  </td>
                  <td className="px-2 py-1.5 text-right">{quote} %</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted">
        Sortiert nach Siegen. Automatisch aus den eingespielten
        nuLiga-Spielberichten zusammengezählt.
      </p>
    </div>
  );
}
