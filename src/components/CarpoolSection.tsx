"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCarpool } from "@/app/mitglieder/termine/spieltag-actions";

export interface CarpoolFahrer {
  name: string;
  seats: number | null;
}

/**
 * Fahrgemeinschaft am Termin: „Ich fahre (N Plätze)“ oder „Ich suche eine
 * Mitfahrgelegenheit“ – jeder pflegt nur seinen eigenen Eintrag.
 */
export function CarpoolSection({
  eventId,
  meineRolle,
  meineSeats,
  fahrer,
  mitfahrer,
}: {
  eventId: string;
  meineRolle: "fahrer" | "mitfahrer" | null;
  meineSeats: number | null;
  fahrer: CarpoolFahrer[];
  mitfahrer: string[];
}) {
  const router = useRouter();
  const [rolle, setRolle] = useState(meineRolle);
  const [seats, setSeats] = useState(meineSeats ?? 3);
  const [isPending, startTransition] = useTransition();

  function speichern(neueRolle: "fahrer" | "mitfahrer" | null, neueSeats?: number) {
    setRolle(neueRolle);
    if (neueSeats != null) setSeats(neueSeats);
    startTransition(async () => {
      await setCarpool(eventId, neueRolle, neueSeats ?? seats);
      router.refresh();
    });
  }

  const knopf = (aktiv: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
      aktiv
        ? "border-ok bg-ok text-white"
        : "border-border bg-surface text-muted hover:text-foreground"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => speichern("fahrer")}
          disabled={isPending}
          className={knopf(rolle === "fahrer")}
        >
          🚗 Ich fahre
        </button>
        {rolle === "fahrer" && (
          <label className="flex items-center gap-1 text-sm">
            mit
            <select
              value={seats}
              onChange={(e) => speichern("fahrer", Number(e.target.value))}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            freien Plätzen
          </label>
        )}
        <button
          onClick={() => speichern("mitfahrer")}
          disabled={isPending}
          className={knopf(rolle === "mitfahrer")}
        >
          🙋 Ich suche eine Mitfahrgelegenheit
        </button>
        {rolle && (
          <button
            onClick={() => speichern(null)}
            disabled={isPending}
            className="text-sm text-muted hover:underline"
          >
            ✕ Austragen
          </button>
        )}
      </div>

      {(fahrer.length > 0 || mitfahrer.length > 0) && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">🚗 Fahrer</p>
            {fahrer.length === 0 ? (
              <p className="text-muted">– noch niemand –</p>
            ) : (
              <ul className="text-muted">
                {fahrer.map((f) => (
                  <li key={f.name}>
                    {f.name}
                    {f.seats ? ` (${f.seats} Plätze frei)` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-medium">🙋 Suchen eine Mitfahrgelegenheit</p>
            {mitfahrer.length === 0 ? (
              <p className="text-muted">– noch niemand –</p>
            ) : (
              <ul className="text-muted">
                {mitfahrer.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
