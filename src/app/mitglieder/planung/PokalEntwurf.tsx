"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { speicherEntwurf, type PokalEntwurf as PokalDaten } from "./actions";

// Pokal-Planung im eigenen Entwurf: gleiche Idee wie die Admin-Pokal-Planung
// (Teams −/+, Kandidaten-Listen, 👑 = Pokal-Kapitän), gespeichert wird NUR
// im eigenen Entwurf – die echten Pokal-Kader bleiben unberührt.

export type PokalPerson = { key: string; name: string; answer: string };
type Zuordnung = { teamNo: number; key: string; captain: boolean };

function mark(answer: string): string {
  if (answer === "yes") return "✓";
  if (answer === "if_needed") return "~";
  if (answer === "no") return "✗";
  return answer ? "•" : "?";
}

function markTitle(answer: string): string {
  if (answer === "yes") return "Hat „Ja“ gesagt";
  if (answer === "if_needed") return "„Ja, wenn ihr jemanden braucht“";
  if (answer === "no") return "Hat „Nein“ gesagt";
  return answer ? `Sonstiges: ${answer}` : "Keine Antwort";
}

export function PokalEntwurf({
  seasonId,
  kind,
  title,
  hint,
  size,
  initialTeams,
  persons,
  initialZuordnungen,
}: {
  seasonId: string;
  kind: string;
  title: string;
  hint: string;
  size: number;
  initialTeams: number;
  persons: PokalPerson[];
  initialZuordnungen: Zuordnung[];
}) {
  const [teams, setTeams] = useState(Math.min(Math.max(initialTeams, 1), 6));
  const [zuordnungen, setZuordnungen] = useState<Zuordnung[]>(initialZuordnungen);
  const [status, setStatus] = useState<"" | "speichert" | "ok" | "fehler">("");
  const [fehlerText, setFehlerText] = useState("");
  const [, startTransition] = useTransition();
  const speicherLauf = useRef(0);

  const nameByKey = useMemo(
    () => new Map(persons.map((p) => [p.key, p])),
    [persons],
  );
  const vergeben = new Set(zuordnungen.map((z) => z.key));
  const offen = persons.filter((p) => !vergeben.has(p.key));
  const gruppen = [
    {
      label: "Ja",
      items: offen.filter((p) => p.answer === "yes"),
      openByDefault: true,
      alleKnopf: true,
    },
    {
      label: "Wenn nötig",
      items: offen.filter((p) => p.answer === "if_needed"),
      openByDefault: false,
      alleKnopf: true,
    },
    {
      label: "Weitere (Nein / Sonstiges / keine Antwort)",
      items: offen.filter((p) => p.answer !== "yes" && p.answer !== "if_needed"),
      openByDefault: false,
      alleKnopf: false,
    },
  ];

  /** Zustand setzen und diesen Pokal im Entwurf speichern. */
  function persist(nextTeams: number, next: Zuordnung[]) {
    setTeams(nextTeams);
    setZuordnungen(next);
    setStatus("speichert");
    const lauf = ++speicherLauf.current;
    startTransition(async () => {
      const daten: PokalDaten = { kind, teams: nextTeams, zuordnungen: next };
      const res = await speicherEntwurf(seasonId, { pokal: daten });
      if (lauf !== speicherLauf.current) return;
      if (res.ok) {
        setStatus("ok");
      } else {
        setStatus("fehler");
        setFehlerText(res.message ?? "Speichern fehlgeschlagen.");
      }
    });
  }

  function add(keys: string[], teamNo: number) {
    const neu = keys
      .filter((k) => !zuordnungen.some((z) => z.key === k))
      .map((k) => ({ teamNo, key: k, captain: false }));
    if (neu.length === 0) return;
    persist(teams, [...zuordnungen, ...neu]);
  }

  function remove(key: string) {
    persist(teams, zuordnungen.filter((z) => z.key !== key));
  }

  /** Pokal-Kapitän an-/abwählen (höchstens einer je Pokal-Team). */
  function toggleCaptain(key: string, teamNo: number) {
    persist(
      teams,
      zuordnungen.map((z) => {
        if (z.key === key) return { ...z, captain: !z.captain };
        if (z.teamNo === teamNo && z.captain) return { ...z, captain: false };
        return z;
      }),
    );
  }

  function changeTeams(delta: number) {
    const n = Math.min(Math.max(teams + delta, 1), 6);
    if (n === teams) return;
    persist(
      n,
      zuordnungen.map((z) => (z.teamNo > n ? { ...z, teamNo: n } : z)),
    );
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{title}</span>
          <p className="text-sm text-muted">{hint}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {status === "speichert" && <span className="text-muted">💾</span>}
            {status === "ok" && <span className="text-ok">✓</span>}
            {status === "fehler" && (
              <span className="text-danger" title={fehlerText}>
                ⚠️
              </span>
            )}
          </span>
          <button
            onClick={() => changeTeams(-1)}
            disabled={teams <= 1}
            className="h-7 w-7 rounded-lg border border-border font-bold hover:bg-border/40 disabled:opacity-40"
            title="Weniger Mannschaften"
          >
            −
          </button>
          <span className="px-1 text-sm font-medium">
            {teams} Team{teams === 1 ? "" : "s"}
          </span>
          <button
            onClick={() => changeTeams(1)}
            disabled={teams >= 6}
            className="h-7 w-7 rounded-lg border border-border font-bold hover:bg-border/40 disabled:opacity-40"
            title="Mehr Mannschaften"
          >
            +
          </button>
        </div>
      </div>
      {status === "fehler" && (
        <p className="mt-2 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {fehlerText}
        </p>
      )}

      {/* Pokal-Teams */}
      <div className="mt-3 space-y-2">
        {Array.from({ length: teams }, (_, i) => i + 1).map((no) => {
          const items = zuordnungen
            .filter((z) => z.teamNo === no)
            .sort(
              (x, y) =>
                Number(y.captain) - Number(x.captain) ||
                (nameByKey.get(x.key)?.name ?? "").localeCompare(
                  nameByKey.get(y.key)?.name ?? "",
                ),
            );
          return (
            <div key={no} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {teams === 1 ? "Kader" : `Team ${no}`}
                </span>
                <Badge tone={items.length >= size ? "ok" : "neutral"}>
                  {items.length}/{size}
                </Badge>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted">Unten übernehmen.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {items.map((z) => {
                    const p = nameByKey.get(z.key);
                    return (
                      <span
                        key={z.key}
                        title={markTitle(p?.answer ?? "")}
                        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                          z.captain
                            ? "bg-primary text-primary-fg"
                            : "bg-primary/15 text-primary"
                        }`}
                      >
                        {z.captain && <span title="Pokal-Kapitän">👑</span>}
                        {p?.name ?? "(unbekannt)"}{" "}
                        <span className="opacity-70">{mark(p?.answer ?? "")}</span>
                        <button
                          onClick={() => toggleCaptain(z.key, z.teamNo)}
                          className="ml-0.5 opacity-60 hover:opacity-100"
                          title={
                            z.captain
                              ? "Kapitäns-Rolle entfernen"
                              : "Zum Pokal-Kapitän machen"
                          }
                        >
                          👑
                        </button>
                        <button
                          onClick={() => remove(z.key)}
                          className="ml-0.5 hover:opacity-70"
                          title="Aus dem Kader entfernen"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Kandidaten */}
      <div className="mt-3 space-y-2">
        {gruppen.map((g) =>
          g.items.length === 0 ? null : (
            <details
              key={g.label}
              open={g.openByDefault}
              className="rounded-lg border border-border"
            >
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
                {g.label} <span className="text-muted">({g.items.length})</span>
              </summary>
              <div className="space-y-1 border-t border-border p-3">
                {g.alleKnopf && g.items.length > 1 && (
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {teams === 1 ? (
                      <button
                        onClick={() => add(g.items.map((p) => p.key), 1)}
                        className="inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                      >
                        ⚡ Alle übernehmen ({g.items.length})
                      </button>
                    ) : (
                      <>
                        <span className="text-sm text-muted">
                          ⚡ Alle {g.items.length} übernehmen zu:
                        </span>
                        {Array.from({ length: teams }, (_, i) => i + 1).map(
                          (no) => (
                            <button
                              key={no}
                              onClick={() => add(g.items.map((p) => p.key), no)}
                              className="rounded-lg bg-primary px-3 py-1 text-sm font-medium text-primary-fg hover:opacity-90"
                            >
                              Team {no}
                            </button>
                          ),
                        )}
                      </>
                    )}
                  </div>
                )}
                {g.items
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <div
                      key={p.key}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-border/30"
                    >
                      <span title={markTitle(p.answer)}>
                        {p.name}{" "}
                        <span className="text-muted">{mark(p.answer)}</span>
                      </span>
                      <span className="flex gap-1">
                        {teams === 1 ? (
                          <button
                            onClick={() => add([p.key], 1)}
                            className="rounded-lg border border-border px-2 py-0.5 hover:bg-border/40"
                          >
                            + Übernehmen
                          </button>
                        ) : (
                          Array.from({ length: teams }, (_, i) => i + 1).map(
                            (no) => (
                              <button
                                key={no}
                                onClick={() => add([p.key], no)}
                                className="rounded-lg border border-border px-2 py-0.5 hover:bg-border/40"
                                title={`Zu Team ${no}`}
                              >
                                +{no}
                              </button>
                            ),
                          )
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </details>
          ),
        )}
      </div>
    </div>
  );
}
