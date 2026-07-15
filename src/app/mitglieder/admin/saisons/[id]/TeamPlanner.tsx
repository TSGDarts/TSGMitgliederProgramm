"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Badge } from "@/components/ui";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
  moveTeamMemberAction,
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

type DragData = { key: string; from: string | null };

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

function readDragData(e: React.DragEvent): DragData | null {
  try {
    const raw = e.dataTransfer.getData("text/plain");
    const data = JSON.parse(raw) as DragData;
    return data && typeof data.key === "string" ? data : null;
  } catch {
    return null;
  }
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
  const [overZone, setOverZone] = useState<string | null>(null);
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
    setAssign((s) => [...s, { teamId, key }]);
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

  function move(key: string, from: string | null, to: string) {
    if (from === to) return;
    if (!from) return add(key, to);
    setError("");
    setAssign((s) => {
      const without = s.filter((a) => !(a.key === key && a.teamId === from));
      if (without.some((a) => a.key === key && a.teamId === to)) return without;
      return [...without, { teamId: to, key }];
    });
    startTransition(async () => {
      const res = await moveTeamMemberAction(from, to, key);
      if (!res.ok) fail(res.message);
    });
  }

  function dragStart(e: React.DragEvent, data: DragData) {
    e.dataTransfer.setData("text/plain", JSON.stringify(data));
    e.dataTransfer.effectAllowed = "move";
  }

  function dropZoneProps(zone: string, onDrop: (data: DragData) => void) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOverZone(zone);
      },
      onDragLeave: () =>
        setOverZone((z) => (z === zone ? null : z)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setOverZone(null);
        const data = readDragData(e);
        if (data) onDrop(data);
      },
    };
  }

  function PersonRow({
    p,
    from,
    hideTeams,
  }: {
    p: TeamPerson;
    from: string | null;
    hideTeams?: Set<string>;
  }) {
    return (
      <div
        draggable
        onDragStart={(e) => dragStart(e, { key: p.key, from })}
        className="flex cursor-grab flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-border/30 active:cursor-grabbing"
      >
        <span title={freqTitle(p)} className="min-w-0">
          <span className="mr-1 text-muted">⠿</span>
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
        <p className="text-sm text-muted">
          💡 Ziehe die Namen einfach mit der Maus in die Team-Kästen (oder
          zurück in die Liste). Auf dem Handy nimmst du die +1/+2-Knöpfe.
        </p>

        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Team-Boxen (Ablagezonen) */}
        <div className="grid gap-3 md:grid-cols-2">
          {teams.map((t, i) => {
            const items = assign
              .filter((a) => a.teamId === t.id)
              .map((a) => personByKey.get(a.key))
              .filter(Boolean) as TeamPerson[];
            const zone = `team:${t.id}`;
            return (
              <div
                key={t.id}
                {...dropZoneProps(zone, (data) => move(data.key, data.from, t.id))}
                className={`rounded-lg border p-3 transition ${
                  overZone === zone
                    ? "border-primary bg-primary/10 ring-2 ring-primary/30"
                    : "border-border"
                }`}
              >
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
                  <p className="text-sm text-muted">
                    Hierher ziehen oder per Knopf zuordnen.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {items
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((p) => (
                        <span
                          key={p.key}
                          draggable
                          onDragStart={(e) =>
                            dragStart(e, { key: p.key, from: t.id })
                          }
                          title={`${freqTitle(p)} – ziehen zum Verschieben`}
                          className="inline-flex cursor-grab items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary active:cursor-grabbing"
                        >
                          {p.name}{" "}
                          <span className="opacity-70">{freqMark(p.freq)}</span>
                          <button
                            onClick={() => remove(p.key, t.id)}
                            className="ml-0.5 hover:opacity-70"
                            title="Aus dem Team entfernen"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Noch ohne Mannschaft (auch Ablagezone zum Entfernen) */}
        <details
          open
          {...dropZoneProps("out", (data) => {
            if (data.from) remove(data.key, data.from);
          })}
          className={`rounded-lg border transition ${
            overZone === "out"
              ? "border-primary bg-primary/10 ring-2 ring-primary/30"
              : "border-border"
          }`}
        >
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
            Noch ohne Mannschaft{" "}
            <span className="text-muted">({unassigned.length})</span>
            <span className="ml-2 text-xs font-normal text-muted">
              (Chips hierher ziehen = aus dem Team nehmen)
            </span>
          </summary>
          <div className="space-y-1 border-t border-border p-3">
            {unassigned.length === 0 ? (
              <p className="text-sm text-muted">
                Alle sind einer Mannschaft zugeordnet. 🎉
              </p>
            ) : (
              unassigned.map((p) => (
                <PersonRow key={p.key} p={p} from={null} />
              ))
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
                  from={null}
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
