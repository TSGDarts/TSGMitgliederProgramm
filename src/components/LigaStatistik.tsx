"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  LigaStatistik,
  SaisonStatistik,
  StatistikEintrag,
} from "@/lib/statistik";

// Liga-Statistik im Profil: Kacheln anklicken zeigt die Einzelnachweise
// (welcher Spieltag, gegen wen, Ergebnis) – Klick auf einen Eintrag führt
// zum Termin.

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

const TONE_KLASSE: Record<StatistikEintrag["tone"], string> = {
  ok: "text-ok",
  danger: "text-danger",
  neutral: "text-muted",
};

export function LigaStatistikKacheln({
  saisons,
}: {
  saisons: SaisonStatistik[];
}) {
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [saisonIndex, setSaisonIndex] = useState(0);
  const statistik = saisons[saisonIndex]?.statistik ?? saisons[0].statistik;

  const kacheln: {
    key: keyof LigaStatistik["details"];
    wert: string;
    label: string;
  }[] = [
    { key: "spieltage", wert: String(statistik.spieltage), label: "Spieltage" },
    {
      key: "einzel",
      wert: `${statistik.einzelSiege}–${statistik.einzelNiederlagen}`,
      label: "Einzel (S–N)",
    },
    {
      key: "doppel",
      wert: `${statistik.doppelSiege}–${statistik.doppelNiederlagen}`,
      label: "Doppel (S–N)",
    },
    {
      key: "legs",
      wert: `${statistik.legsGewonnen}:${statistik.legsVerloren}`,
      label: "Legs",
    },
    { key: "m180", wert: String(statistik.anzahl180), label: "180er" },
    {
      key: "finish",
      wert: statistik.besterFinish !== null ? String(statistik.besterFinish) : "–",
      label: "Bester Finish",
    },
    {
      key: "lowdarts",
      wert:
        statistik.besterLowDarts !== null
          ? String(statistik.besterLowDarts)
          : "–",
      label: "Kürzestes Leg (Darts)",
    },
  ];

  const eintraege = auswahl
    ? statistik.details[auswahl as keyof LigaStatistik["details"]]
    : [];

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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kacheln.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setAuswahl(auswahl === k.key ? null : k.key)}
            className={`rounded-lg border p-3 text-center transition ${
              auswahl === k.key
                ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                : "border-border hover:border-primary/50"
            }`}
          >
            <p className="text-2xl font-bold">{k.wert}</p>
            <p className="text-xs text-muted">{k.label}</p>
          </button>
        ))}
      </div>

      {auswahl && (
        <div className="rounded-lg border border-border p-3">
          {eintraege.length === 0 ? (
            <p className="text-sm text-muted">Noch keine Einträge.</p>
          ) : (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {eintraege.map((e, i) => (
                <Link
                  key={`${e.eventId}-${i}`}
                  href={`/mitglieder/termine/${e.eventId}`}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 text-sm hover:bg-border/30"
                >
                  <span className="min-w-0">
                    <span className="text-muted">
                      {dateFmt.format(new Date(e.datum))}
                    </span>{" "}
                    {e.titel}
                  </span>
                  <span className={`font-medium ${TONE_KLASSE[e.tone]}`}>
                    {e.text}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-muted">
        Automatisch zusammengezählt aus den eingespielten
        nuLiga-Spielberichten (Einzel + Doppel, alle Saisons). Kachel
        antippen zeigt die Einzelnachweise – Eintrag antippen öffnet den
        Spieltag.
      </p>
    </div>
  );
}
