"use client";

import { useMemo, useState } from "react";

const ARTEN: {
  key: string;
  label: string;
  teamwahl?: boolean;
  standard?: boolean; // false = im Abo standardmäßig abgewählt
}[] = [
  { key: "punktspiele", label: "🎯 Punktspiele (Liga)", teamwahl: true },
  { key: "pokal", label: "🏆 Pokalspiele", teamwahl: true },
  { key: "freundschaft", label: "🤝 Freundschaftsspiele", teamwahl: true },
  { key: "training", label: "💪 Training", teamwahl: true },
  { key: "verein", label: "🏠 Vereinstermine (Feste, Besprechungen …)" },
  { key: "turniere", label: "🏟 Turniere im Umkreis" },
  { key: "competitions", label: "🎯 Unsere Competition-Abende" },
  { key: "feiertage", label: "⭐ Feiertage in Bayern", standard: false },
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
    new Set(ARTEN.filter((a) => a.standard !== false).map((a) => a.key)),
  );
  // Kategorien, die trotz Mannschafts-Filter von ALLEN Mannschaften kommen
  const [trotzTeam, setTrotzTeam] = useState<Set<string>>(new Set());
  // Turnierarten: BDV/DDV lassen sich abwählen (Bezirk + freie sind immer dabei)
  const [mitBdv, setMitBdv] = useState(true);
  const [mitDdv, setMitDdv] = useState(true);

  const url = useMemo(() => {
    const params = new URLSearchParams();
    if (team) params.set("team", team);
    // Nur mitschicken, wenn die Auswahl vom Standard abweicht
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
    if (team) {
      const alle = ARTEN.map((a) => a.key).filter(
        (k) => trotzTeam.has(k) && arten.has(k),
      );
      if (alle.length) params.set("alle", alle.join(","));
    }
    if (arten.has("turniere") && (!mitBdv || !mitDdv)) {
      params.set(
        "turnierarten",
        ["bezirk", "frei", mitBdv ? "bdv" : "", mitDdv ? "ddv" : ""]
          .filter(Boolean)
          .join(","),
      );
    }
    const qs = params.toString();
    return qs ? `${icsUrl}?${qs}` : icsUrl;
  }, [icsUrl, team, arten, trotzTeam, mitBdv, mitDdv]);

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
                {a.key === "turniere" && arten.has("turniere") && (
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={mitBdv}
                        onChange={(e) => setMitBdv(e.target.checked)}
                      />
                      inkl. BDV
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={mitDdv}
                        onChange={(e) => setMitDdv(e.target.checked)}
                      />
                      inkl. DDV
                    </label>
                  </span>
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
