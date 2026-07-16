"use client";

import { useActionState } from "react";
import {
  importNuligaIcal,
  type ImportResult,
} from "@/app/mitglieder/admin/mannschaften/actions";
import { Button } from "@/components/ui";

/**
 * Spieltage einer VERGANGENEN Saison nachtragen: iCal-Adresse des
 * damaligen nuLiga-Kalenders eintragen und importieren – die Spieltage
 * landen mit ihrem echten (vergangenen) Datum als Termine im Kalender.
 */
export function AltSaisonImport({
  teamId,
  teamName,
}: {
  teamId: string;
  teamName: string;
}) {
  const [state, formAction, pending] = useActionState<
    ImportResult | null,
    FormData
  >(importNuligaIcal, null);

  return (
    <div className="space-y-1">
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="team_id" value={teamId} />
        <span className="w-32 shrink-0 text-sm font-medium">{teamName}</span>
        <input
          name="ical_url"
          type="url"
          placeholder="webcal://… oder https://… (Link hinter „Zu Kalender hinzufügen“)"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
        />
        <label className="flex cursor-pointer items-center gap-1 text-sm text-muted">
          <span className="rounded-lg border border-border px-2 py-1.5 hover:bg-border/40">
            📎 .ics-Datei
          </span>
          <input
            name="ical_file"
            type="file"
            accept=".ics,text/calendar"
            className="max-w-40 text-xs"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Importiere …" : "Importieren"}
        </Button>
      </form>
      {state && (
        <p
          className={`ml-32 pl-2 text-sm ${state.ok ? "text-ok" : "text-danger"}`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
