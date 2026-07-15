"use client";

import { useMemo, useState } from "react";

const ARTEN: { key: string; label: string; teamwahl?: boolean }[] = [
  { key: "punktspiele", label: "🎯 Punktspiele (Liga)" },
  { key: "pokal", label: "🏆 Pokalspiele", teamwahl: true },
  { key: "freundschaft", label: "🤝 Freundschaftsspiele", teamwahl: true },
  { key: "training", label: "💪 Training", teamwahl: true },
  { key: "verein", label: "🏠 Vereinstermine (Feste, Besprechungen …)" },
  { key: "turniere", label: "🏟 Turniere im Umkreis" },
  { key: "competitions", label: "🎯 Unsere Competition-Abende" },
];

/**
 * Abo-Baukasten für den ICS-Kalender: Mitglieder wählen Mannschaft und
 * Termin-Arten – daraus entsteht die persönliche Abo-Adresse. webcal://
 * öffnet direkt die Kalender-App; als Ausweichweg lässt sich die Adresse
 * kopieren und im Kalender als Abo-Kalender eintragen.
 */
export function CalendarSubscribe({
  icsUrl,
  teams,
}: {
  icsUrl: string;
  teams: { id: string; name: string }[];
}) {
  const [copied, setCopied] = useState(false);
  const [team, setTeam] = useState("");
  const [arten, setArten] = useState<Set<string>>(
    new Set(ARTEN.map((a) => a.key)),
  );
  // Kategorien, die trotz Mannschafts-Filter von ALLEN Mannschaften kommen
  const [trotzTeam, setTrotzTeam] = useState<Set<string>>(new Set());

  const alleGewaehlt = arten.size === ARTEN.length;
  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (team) params.set("team", team);
    if (!alleGewaehlt) params.set("arten", ARTEN.map((a) => a.key).filter((k) => arten.has(k)).join(","));
    if (team) {
      const alle = ARTEN.map((a) => a.key).filter(
        (k) => trotzTeam.has(k) && arten.has(k),
      );
      if (alle.length) params.set("alle", alle.join(","));
    }
    const qs = params.toString();
    return qs ? `${icsUrl}?${qs}` : icsUrl;
  }, [icsUrl, team, arten, alleGewaehlt, trotzTeam]);

  const webcalUrl = url.replace(/^https?:\/\//i, "webcal://");

  function toggleArt(key: string) {
    setArten((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Mannschaft</span>
          <select
            value={team}
            onChange={(e) => setTeam(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Alle Mannschaften</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                nur {t.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">
            Vereinstermine, Turniere & Competitions sind nicht
            mannschaftsgebunden und bleiben enthalten.
          </span>
        </label>
        <fieldset className="text-sm">
          <legend className="mb-1 font-medium">Was soll in den Kalender?</legend>
          <div className="space-y-1">
            {ARTEN.map((a) => (
              <div key={a.key} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={arten.has(a.key)}
                    onChange={() => toggleArt(a.key)}
                  />
                  {a.label}
                </label>
                {a.teamwahl && team && arten.has(a.key) && (
                  <select
                    value={trotzTeam.has(a.key) ? "alle" : "team"}
                    onChange={(e) =>
                      setTrotzTeam((prev) => {
                        const next = new Set(prev);
                        if (e.target.value === "alle") next.add(a.key);
                        else next.delete(a.key);
                        return next;
                      })
                    }
                    className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                  >
                    <option value="team">nur gewählte Mannschaft</option>
                    <option value="alle">alle Mannschaften</option>
                  </select>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      </div>

      {arten.size === 0 ? (
        <p className="text-sm text-warn">
          Bitte mindestens eine Termin-Art auswählen.
        </p>
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
