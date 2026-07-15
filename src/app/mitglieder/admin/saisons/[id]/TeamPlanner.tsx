"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Badge } from "@/components/ui";
import {
  addTeamMemberAction,
  removeTeamMemberAction,
  moveTeamMemberAction,
  setTeamRoleAction,
  swapTeamsAction,
} from "../team-actions";

export type TeamInfo = { id: string; name: string; home?: string };
export type TeamPerson = {
  key: string; // "p:<id>" | "i:<id>"
  name: string;
  freq: string; // play_frequency
  captain: string; // captain_interest
  wishes: string;
};
export type TeamRole = "captain" | "vice" | null;
export type TeamAssign = { teamId: string; key: string; role: TeamRole };

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
  const [swapA, setSwapA] = useState("");
  const [swapB, setSwapB] = useState("");
  const [, startTransition] = useTransition();

  const personByKey = useMemo(
    () => new Map(persons.map((p) => [p.key, p])),
    [persons],
  );
  const teamNameById = useMemo(
    () => new Map(teams.map((t) => [t.id, t.name])),
    [teams],
  );
  // Für die Mehrfach-Markierung: in welchen Teams steckt jede Person?
  const teamsByKey = new Map<string, string[]>();
  for (const a of assign) {
    const list = teamsByKey.get(a.key) ?? [];
    list.push(a.teamId);
    teamsByKey.set(a.key, list);
  }
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
    setAssign((s) => [...s, { teamId, key, role: null }]);
    startTransition(async () => {
      const res = await addTeamMemberAction(teamId, key);
      if (!res.ok) fail(res.message);
    });
  }

  /** Rolle durchschalten: Spieler → Kapitän → Vize → Spieler. */
  function cycleRole(key: string, teamId: string, current: TeamRole) {
    if (!key.startsWith("p:")) return; // nur registrierte Mitglieder
    const next: TeamRole =
      current === null ? "captain" : current === "captain" ? "vice" : null;
    setError("");
    setAssign((s) =>
      s.map((a) => {
        if (a.teamId !== teamId) return a;
        if (a.key === key) return { ...a, role: next };
        // Eindeutigkeit im Team: bisherigen Kapitän/Vize ablösen
        if (next !== null && a.role === next) return { ...a, role: null };
        return a;
      }),
    );
    startTransition(async () => {
      const res = await setTeamRoleAction(teamId, key, next ?? "none");
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
      return [...without, { teamId: to, key, role: null }];
    });
    startTransition(async () => {
      const res = await moveTeamMemberAction(from, to, key);
      if (!res.ok) fail(res.message);
    });
  }

  /** Komplette Kader zweier Teams tauschen. */
  function doSwap() {
    if (!swapA || !swapB || swapA === swapB) return;
    setError("");
    setAssign((s) =>
      s.map((a) =>
        a.teamId === swapA
          ? { ...a, teamId: swapB }
          : a.teamId === swapB
            ? { ...a, teamId: swapA }
            : a,
      ),
    );
    const a = swapA;
    const b = swapB;
    setSwapA("");
    setSwapB("");
    startTransition(async () => {
      const res = await swapTeamsAction(a, b);
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
    note,
  }: {
    p: TeamPerson;
    from: string | null;
    hideTeams?: Set<string>;
    note?: string;
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
          {note && (
            <span className="ml-1 text-xs text-muted">({note})</span>
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
          💡 Ziehe die Namen mit der Maus in die Team-Kästen (oder zurück in
          die Liste) – auf dem Handy nimmst du die +1/+2-Knöpfe. Klick auf die
          👑 am Chip macht jemanden zum Kapitän (nochmal = Vize, nochmal = weg).
        </p>

        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Teams komplett tauschen */}
        {teams.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-border/20 px-3 py-2 text-sm">
            <span className="font-medium">Kader komplett tauschen:</span>
            <select
              value={swapA}
              onChange={(e) => setSwapA(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1"
            >
              <option value="">Team wählen …</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === swapB}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="font-bold">⇄</span>
            <select
              value={swapB}
              onChange={(e) => setSwapB(e.target.value)}
              className="rounded-lg border border-border bg-surface px-2 py-1"
            >
              <option value="">Team wählen …</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id} disabled={t.id === swapA}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              onClick={doSwap}
              disabled={!swapA || !swapB || swapA === swapB}
              className="rounded-lg bg-primary px-3 py-1 font-medium text-primary-fg hover:opacity-90 disabled:opacity-40"
            >
              Tauschen
            </button>
          </div>
        )}

        {/* Team-Boxen (Ablagezonen) */}
        <div className="grid gap-3 md:grid-cols-2">
          {teams.map((t, i) => {
            const items = assign
              .filter((a) => a.teamId === t.id)
              .map((a) => ({ a, p: personByKey.get(a.key) }))
              .filter((x) => x.p) as { a: TeamAssign; p: TeamPerson }[];
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
                    {t.home && (
                      <span className="ml-2 text-xs font-normal text-muted">
                        🕗 {t.home}
                      </span>
                    )}
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
                      .sort(
                        (x, y) =>
                          // Kapitän zuerst, dann Vize, dann alphabetisch
                          (x.a.role === "captain" ? 0 : x.a.role === "vice" ? 1 : 2) -
                            (y.a.role === "captain" ? 0 : y.a.role === "vice" ? 1 : 2) ||
                          x.p.name.localeCompare(y.p.name),
                      )
                      .map(({ a, p }) => {
                        const otherTeams = (teamsByKey.get(p.key) ?? [])
                          .filter((tid) => tid !== t.id)
                          .map((tid) => teamNameById.get(tid))
                          .filter(Boolean);
                        return (
                        <span
                          key={p.key}
                          draggable
                          onDragStart={(e) =>
                            dragStart(e, { key: p.key, from: t.id })
                          }
                          title={`${freqTitle(p)} – ziehen zum Verschieben`}
                          className={`inline-flex cursor-grab items-center gap-1 rounded-full px-3 py-1 text-sm active:cursor-grabbing ${
                            a.role === "captain"
                              ? "bg-primary text-primary-fg"
                              : a.role === "vice"
                                ? "bg-primary/30 text-primary"
                                : "bg-primary/15 text-primary"
                          }`}
                        >
                          {a.role === "captain" && <span title="Kapitän">👑</span>}
                          {a.role === "vice" && (
                            <span className="text-xs font-bold" title="Vize-Kapitän">
                              VC
                            </span>
                          )}
                          {p.name}{" "}
                          <span className="opacity-70">{freqMark(p.freq)}</span>
                          {p.key.startsWith("p:") && (
                            <button
                              onClick={() => cycleRole(p.key, t.id, a.role)}
                              className="ml-0.5 opacity-60 hover:opacity-100"
                              title={
                                a.role === null
                                  ? "Zum Kapitän machen"
                                  : a.role === "captain"
                                    ? "Zum Vize-Kapitän machen"
                                    : "Rolle entfernen"
                              }
                            >
                              👑
                            </button>
                          )}
                          {otherTeams.length > 0 && (
                            <span
                              className="rounded-full bg-warn/25 px-1.5 text-xs font-bold text-warn"
                              title={`Auch zugeordnet in: ${otherTeams.join(", ")}`}
                            >
                              +{otherTeams.length}
                            </span>
                          )}
                          <button
                            onClick={() => remove(p.key, t.id)}
                            className="ml-0.5 hover:opacity-70"
                            title="Aus dem Team entfernen"
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
                  note={`in: ${(teamsByKey.get(p.key) ?? [])
                    .map((tid) => teamNameById.get(tid))
                    .filter(Boolean)
                    .join(", ")}`}
                />
              ))}
            </div>
          </details>
        )}
      </CardBody>
    </Card>
  );
}
