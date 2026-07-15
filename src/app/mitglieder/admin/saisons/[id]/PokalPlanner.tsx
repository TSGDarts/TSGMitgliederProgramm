"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody, Badge } from "@/components/ui";
import {
  addPokalManyAction,
  removePokalAction,
  setPokalTeamsAction,
} from "../pokal-actions";

export type PokalPerson = { key: string; name: string; answer: string };
export type SquadItem = { id: string; teamNo: number; key: string };

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

export function PokalPlanner({
  seasonId,
  kind,
  title,
  hint,
  size,
  initialTeams,
  persons,
  initialSquad,
}: {
  seasonId: string;
  kind: string;
  title: string;
  hint: string;
  size: number;
  initialTeams: number;
  persons: PokalPerson[];
  initialSquad: SquadItem[];
}) {
  const router = useRouter();
  const [teams, setTeams] = useState(Math.max(1, initialTeams));
  const [squad, setSquad] = useState<SquadItem[]>(initialSquad);
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  const nameByKey = useMemo(
    () => new Map(persons.map((p) => [p.key, p])),
    [persons],
  );
  const assigned = new Set(squad.map((s) => s.key));
  const open = persons.filter((p) => !assigned.has(p.key));
  const groups = [
    { label: "Ja", items: open.filter((p) => p.answer === "yes"), openByDefault: true },
    { label: "Wenn nötig", items: open.filter((p) => p.answer === "if_needed"), openByDefault: false },
    {
      label: "Weitere (Nein / Sonstiges / keine Antwort)",
      items: open.filter((p) => p.answer !== "yes" && p.answer !== "if_needed"),
      openByDefault: false,
    },
  ];

  function fail(message?: string) {
    setError(message || "Das hat nicht geklappt. Lade die Seite neu …");
    router.refresh();
  }

  function addPersons(keys: string[], teamNo: number) {
    if (keys.length === 0) return;
    setError("");
    const stamp = Date.now();
    const temp = keys.map((k) => ({ id: `tmp-${k}-${stamp}`, teamNo, key: k }));
    setSquad((s) => [...s, ...temp]); // sofort anzeigen
    startTransition(async () => {
      const res = await addPokalManyAction(seasonId, kind, teamNo, keys);
      if (!res.ok) return fail(res.message);
      setSquad((s) =>
        s.map((item) => {
          if (!item.id.startsWith("tmp-")) return item;
          const found = res.added.find((a) => a.target === item.key);
          return found ? { ...item, id: found.id } : item;
        }),
      );
    });
  }

  function removeItem(item: SquadItem) {
    if (item.id.startsWith("tmp-")) return; // noch nicht gespeichert
    setError("");
    setSquad((s) => s.filter((x) => x.id !== item.id)); // sofort entfernen
    startTransition(async () => {
      const res = await removePokalAction(item.id);
      if (!res.ok) return fail(res.message);
    });
  }

  function changeTeams(delta: number) {
    const n = Math.min(Math.max(teams + delta, 1), 6);
    if (n === teams) return;
    setError("");
    setTeams(n);
    setSquad((s) => s.map((x) => (x.teamNo > n ? { ...x, teamNo: n } : x)));
    startTransition(async () => {
      const res = await setPokalTeamsAction(seasonId, kind, n);
      if (!res.ok) return fail(res.message);
    });
  }

  return (
    <Card>
      <CardBody className="space-y-4">
        {/* Kopf */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold">{title}</span>
            <p className="text-sm text-muted">{hint}</p>
          </div>
          <div className="flex items-center gap-1 text-sm">
            <button
              onClick={() => changeTeams(-1)}
              disabled={teams <= 1}
              className="h-7 w-7 rounded-lg border border-border font-bold hover:bg-border/40 disabled:opacity-40"
              title="Weniger Mannschaften"
            >
              −
            </button>
            <span className="px-1 font-medium">
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

        {error && (
          <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        {/* Teams */}
        <div className="space-y-2">
          {Array.from({ length: teams }, (_, i) => i + 1).map((no) => {
            const items = squad.filter((s) => s.teamNo === no);
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
                  <p className="text-sm text-muted">Noch niemand zugeordnet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {items.map((item) => {
                      const p = nameByKey.get(item.key);
                      const pendingSave = item.id.startsWith("tmp-");
                      return (
                        <button
                          key={item.id}
                          onClick={() => removeItem(item)}
                          disabled={pendingSave}
                          title={`${markTitle(p?.answer ?? "")} – klicken zum Entfernen`}
                          className={`inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary hover:bg-primary/25 ${
                            pendingSave ? "opacity-50" : ""
                          }`}
                        >
                          {p?.name ?? "(unbekannt)"}{" "}
                          <span className="opacity-70">{mark(p?.answer ?? "")}</span>{" "}
                          ✕
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Kandidaten */}
        {groups.map((g) =>
          g.items.length === 0 ? null : (
            <details
              key={g.label}
              open={g.openByDefault}
              className="rounded-lg border border-border"
            >
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
                {g.label}{" "}
                <span className="text-muted">({g.items.length})</span>
              </summary>
              <div className="space-y-1 border-t border-border p-3">
                {g.label === "Ja" && teams === 1 && g.items.length > 1 && (
                  <button
                    onClick={() => addPersons(g.items.map((p) => p.key), 1)}
                    className="mb-2 inline-flex items-center rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                  >
                    ⚡ Alle übernehmen ({g.items.length})
                  </button>
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
                            onClick={() => addPersons([p.key], 1)}
                            className="rounded-lg border border-border px-2 py-0.5 hover:bg-border/40"
                          >
                            + Übernehmen
                          </button>
                        ) : (
                          Array.from({ length: teams }, (_, i) => i + 1).map(
                            (no) => (
                              <button
                                key={no}
                                onClick={() => addPersons([p.key], no)}
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
      </CardBody>
    </Card>
  );
}
