"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { syncAllNuligaManual, type AllNuligaImportResult } from "./actions";

export function AllNuligaSyncButton({ configuredTeams }: { configuredTeams: number }) {
  const [state, formAction, pending] = useActionState<AllNuligaImportResult | null>(
    syncAllNuligaManual,
    null,
  );

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <Button type="submit" disabled={pending || configuredTeams === 0}>
          {pending ? "Gleiche alle Mannschaften ab …" : "Alle Mannschaften mit nuLiga abgleichen"}
        </Button>
      </form>
      <div aria-live="polite" className="space-y-3">
        {pending && <p className="text-sm text-muted">Der Abgleich läuft. Das Ergebnis erscheint hier für jede Mannschaft.</p>}
        {configuredTeams === 0 && (
          <p className="text-sm text-muted">Zuerst bei einer Mannschaft die nuLiga-iCal-Adresse speichern.</p>
        )}
        {state && !pending && (
          <>
            <p className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>{state.message}</p>
            {state.teams.length > 0 && (
              <ul className="space-y-3">
                {state.teams.map((team) => (
                  <li key={team.teamId} className="rounded-lg border border-border p-3">
                    <p className="text-sm font-medium">
                      {team.teamName}{" · "}
                      <span className={team.ok ? "text-ok" : "text-danger"}>
                        {team.ok ? "Abgeglichen" : "Fehler beim Abgleich"}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-muted">{team.message}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
