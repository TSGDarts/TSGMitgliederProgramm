"use client";

import { useMemo, useState } from "react";

const TURNIER_ARTEN: { key: string; label: string }[] = [
  { key: "ddv", label: "DDV-Turniere" },
  { key: "bdv", label: "BDV-Turniere" },
  { key: "bezirk", label: "Bezirksturniere" },
  { key: "frei", label: "Freie Turniere" },
];

const ARTEN: {
  key: string;
  label: string;
  teams?: boolean; // Mannschafts-Auswahl möglich
  standard?: boolean; // false = im Abo standardmäßig abgewählt
}[] = [
  { key: "punktspiele", label: "🎯 Punktspiele (Liga)", teams: true },
  { key: "pokal", label: "🏆 Pokalspiele", teams: true },
  { key: "freundschaft", label: "🤝 Freundschaftsspiele", teams: true },
  { key: "training", label: "💪 Training" },
  { key: "verein", label: "🏠 Vereinstermine (Feste, Besprechungen …)" },
  { key: "turniere", label: "🏟 Turniere im Umkreis" },
  { key: "competitions", label: "🎯 Unsere Competition-Abende" },
  { key: "feiertage", label: "⭐ Feiertage in Bayern", standard: false },
];

/**
 * Abo-Baukasten für den ICS-Kalender: je Termin-Art wählbar, bei
 * Liga/Pokal/Freundschaft zusätzlich mit Mannschafts-Auswahl (auch mehrere,
 * z. B. 1. und 3.), bei Turnieren nach Turnierart. Daraus entsteht die
 * persönliche Abo-Adresse.
 */
export function CalendarSubscribe({
  icsUrl,
  teams,
}: {
  icsUrl: string;
  teams: { id: string; name: string }[];
}) {
  const [copied, setCopied] = useState(false);
  const [arten, setArten] = useState<Set<string>>(
    new Set(ARTEN.filter((a) => a.standard !== false).map((a) => a.key)),
  );
  // Je Kategorie: null = alle Mannschaften, sonst die gewählten Team-Ids
  const [teamWahl, setTeamWahl] = useState<
    Record<string, Set<string> | null>
  >({ punktspiele: null, pokal: null, freundschaft: null });
  const [turnierKinds, setTurnierKinds] = useState<Set<string>>(
    new Set(TURNIER_ARTEN.map((t) => t.key)),
  );

  function toggleArt(key: string) {
    setArten((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleTeam(art: string, teamId: string) {
    setTeamWahl((prev) => {
      const aktuelle = new Set(prev[art] ?? []);
      if (aktuelle.has(teamId)) aktuelle.delete(teamId);
      else aktuelle.add(teamId);
      return { ...prev, [art]: aktuelle };
    });
  }

  const problem = useMemo(() => {
    if (arten.size === 0) return "Bitte mindestens eine Termin-Art auswählen.";
    for (const a of ARTEN) {
      if (a.teams && arten.has(a.key)) {
        const wahl = teamWahl[a.key];
        if (wahl && wahl.size === 0) {
          return `Bitte bei „${a.label}“ mindestens eine Mannschaft anhaken.`;
        }
      }
    }
    if (arten.has("turniere") && turnierKinds.size === 0) {
      return "Bitte mindestens eine Turnierart anhaken.";
    }
    return "";
  }, [arten, teamWahl, turnierKinds]);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    const standardKeys = ARTEN.filter((a) => a.standard !== false).map(
      (a) => a.key,
    );
    const istStandard =
      arten.size === standardKeys.length &&
      standardKeys.every((k) => arten.has(k));
    if (!istStandard) {
      params.set(
        "arten",
        ARTEN.map((a) => a.key).filter((k) => arten.has(k)).join(","),
      );
    }
    for (const a of ARTEN) {
      if (a.teams && arten.has(a.key)) {
        const wahl = teamWahl[a.key];
        if (wahl && wahl.size > 0) {
          params.set(`${a.key}Teams`, [...wahl].join(","));
        }
      }
    }
    if (arten.has("turniere") && turnierKinds.size < TURNIER_ARTEN.length) {
      params.set(
        "turnierarten",
        TURNIER_ARTEN.map((t) => t.key)
          .filter((k) => turnierKinds.has(k))
          .join(","),
      );
    }
    const qs = params.toString();
    return qs ? `${icsUrl}?${qs}` : icsUrl;
  }, [icsUrl, arten, teamWahl, turnierKinds]);

  const webcalUrl = url.replace(/^https?:\/\//i, "webcal://");

  return (
    <div className="space-y-3">
      <fieldset className="text-sm">
        <legend className="mb-1 font-medium">Was soll in den Kalender?</legend>
        <div className="space-y-1.5">
          {ARTEN.map((a) => (
            <div key={a.key} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={arten.has(a.key)}
                    onChange={() => toggleArt(a.key)}
                  />
                  {a.label}
                </label>
                {a.teams && arten.has(a.key) && teams.length > 0 && (
                  <select
                    value={teamWahl[a.key] ? "auswahl" : "alle"}
                    onChange={(e) =>
                      setTeamWahl((prev) => ({
                        ...prev,
                        [a.key]:
                          e.target.value === "auswahl" ? new Set() : null,
                      }))
                    }
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="alle">alle Mannschaften</option>
                    <option value="auswahl">Mannschaften auswählen …</option>
                  </select>
                )}
              </div>
              {a.teams && arten.has(a.key) && teamWahl[a.key] && (
                <div className="ml-6 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {teams.map((t) => (
                    <label key={t.id} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={teamWahl[a.key]?.has(t.id) ?? false}
                        onChange={() => toggleTeam(a.key, t.id)}
                      />
                      {t.name}
                    </label>
                  ))}
                </div>
              )}
              {a.key === "turniere" && arten.has("turniere") && (
                <div className="ml-6 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {TURNIER_ARTEN.map((t) => (
                    <label key={t.key} className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={turnierKinds.has(t.key)}
                        onChange={() =>
                          setTurnierKinds((prev) => {
                            const next = new Set(prev);
                            if (next.has(t.key)) next.delete(t.key);
                            else next.add(t.key);
                            return next;
                          })
                        }
                      />
                      {t.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </fieldset>

      {problem ? (
        <p className="text-sm text-warn">{problem}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={webcalUrl}
            className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
          >
            📅 Kalender abonnieren
          </a>
          <button
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                // Zwischenablage nicht verfügbar – kein Drama
              }
            }}
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
          >
            {copied ? "✓ Kopiert" : "📋 Adresse kopieren"}
          </button>
        </div>
      )}
    </div>
  );
}
