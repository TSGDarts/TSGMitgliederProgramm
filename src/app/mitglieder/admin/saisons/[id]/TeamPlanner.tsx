"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Badge } from "@/components/ui";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
} from "../team-actions";

export type TeamInfo = { id: string; name: string };
export type TeamPerson = {
  key: string; // "p:<id>" | "i:<id>"
  name: string;
  freq: string; // play_frequency
  captain: string; // captain_interest
  wishes: string;
};
export type TeamAssign = { teamId: string; key: string };

function freqMark(freq: string): string {
  if (freq === "always") return "✓";
  if (freq === "when_can") return "~";
  if (freq === "as_needed") return "•";
  if (freq === "backup") return "✗";
  return freq ? "•" : "?";
}

function freqTitle(p: TeamPerson): string {
  const parts: string[] = [];
  if (p.freq === "always") parts.push("Einsatz: jedes Ligaspiel");
  else if (p.freq === "when_can") parts.push("Einsatz: wenn möglich");
  else if (p.freq === "as_needed") parts.push("Einsatz: nach Bedarf");
  else if (p.freq === "backup") parts.push("Einsatz: nur Backup");
  else if (p.freq) parts.push(`Einsatz: ${p.freq}`);
  else parts.push("Keine Antwort");
  if (p.captain === "yes") parts.push("Will Kapitän sein!");
  if (p.captain === "maybe") parts.push("Würde Kapitän machen");
  if (p.wishes) parts.push(`Wunsch: ${p.wishes}`);
  return parts.join(" | ");
}

export function TeamPlanner({
  teams,
  persons,
  initialAssign,
}: {
  teams: TeamInfo[];
  persons: TeamPerson[];
  initialAssign: TeamAssign[];
}) {
  const router = useRouter();
  const [assign, setAssign] = useState<TeamAssign[]>(initialAssign);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const personByKey = useMemo(
    () => new Map(persons.map((p) => [p.key, p])),
    [persons],
  );
  const assignedKeys = new Set(assign.map((a) => a.key));
  const unassigned = persons
    .filter((p) => !assignedKeys.has(p.key))
    .sort((a, b) => a.name.localeCompare(b.name));
  const multiCandidates = persons
    .filter((p) => assignedKeys.has(p.key))
    .sort((a, b) => a.name.localeCompare(b.name));

  function fail(message?: string) {
    setError(message || "Das hat nicht geklappt. Lade die Seite neu …");
    router.refresh();
  }

  function add(key: string, teamId: string) {
    if (assign.some((a) => a.key === key && a.teamId === teamId)) return;
    setError("");
    setAssign((s) => [...s, { teamId, key }]); // sofort anzeigen
    startTransition(async () => {
      const res = await addTeamMemberAction(teamId, key);
      if (!res.ok) fail(res.message);
    });
  }

  function remove(key: string, teamId: string) {
    setError("");
    setAssign((s) => s.filter((a) => !(a.key === key && a.teamId === teamId)));
    startTransition(async () => {
      const res = await removeTeamMemberAction(teamId, key);
      if (!res.ok) fail(res.message);
    });
  }

  function PersonRow({ p, hideTeams }: { p: TeamPerson; hideTeams?: Set<string> }) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-border/30">
        <span title={freqTitle(p)} className="min-w-0">
          {p.name} <span className="text-muted">{freqMark(p.freq)}</span>
          {p.captain === "yes" && <Badge tone="primary">C!</Badge>}
          {p.captain === "maybe" && <Badge>C?</Badge>}
          {p.wishes && (
            <span
              className="ml-1 text-xs text-muted"
              title={`Wunsch: ${p.wishes}`}
            >
              💬
            </span>
          )}
        </span>
        <span className="flex flex-wrap gap-1">
          {teams.map((t, i) =>
            hideTeams?.has(t.id) ? null : (
              <button
                key={t.id}
                onClick={() => add(p.key, t.id)}
                className="rounded-lg border border-border px-2 py-0.5 hover:bg-border/40"
                title={`Zu ${t.name}`}
              >
                +{i + 1}
              </button>
            ),
          )}
        </span>
      </div>
    );
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Team-Boxen */}
        <div className="grid gap-3 md:grid-cols-2">
          {teams.map((t, i) => {
            const items = assign
              .filter((a) => a.teamId === t.id)
              .map((a) => personByKey.get(a.key))
              .filter(Boolean) as TeamPerson[];
            return (
              <div key={t.id} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg">
                      {i + 1}
                    </span>
                    {t.name}
                  </span>
                  <Badge>{items.length}</Badge>
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-muted">Noch niemand zugeordnet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {items
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((p) => (
                        <button
                          key={p.key}
                          onClick={() => remove(p.key, t.id)}
                          title={`${freqTitle(p)} – klicken zum Entfernen`}
                          className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary hover:bg-primary/25"
                        >
                          {p.name}{" "}
                          <span className="opacity-70">{freqMark(p.freq)}</span> ✕
                        </button>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Noch ohne Mannschaft */}
        <details open className="rounded-lg border border-border">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            Noch ohne Mannschaft{" "}
            <span className="text-muted">({unassigned.length})</span>
          </summary>
          <div className="space-y-1 border-t border-border p-3">
            {unassigned.length === 0 ? (
              <p className="text-sm text-muted">
                Alle sind einer Mannschaft zugeordnet. 🎉
              </p>
            ) : (
              unassigned.map((p) => <PersonRow key={p.key} p={p} />)
            )}
          </div>
        </details>

        {/* Bereits zugeordnet – zusätzliches Team möglich */}
        {multiCandidates.length > 0 && (
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
              Bereits zugeordnet – weiteres Team möglich{" "}
              <span className="text-muted">({multiCandidates.length})</span>
            </summary>
            <div className="space-y-1 border-t border-border p-3">
              {multiCandidates.map((p) => (
                <PersonRow
                  key={p.key}
                  p={p}
                  hideTeams={
                    new Set(
                      assign
                        .filter((a) => a.key === p.key)
                        .map((a) => a.teamId),
                    )
                  }
                />
              ))}
            </div>
          </details>
        )}
      </CardBody>
    </Card>
  );
}
