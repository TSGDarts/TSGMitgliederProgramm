"use client";

import { useActionState } from "react";
import {
  importStatistik,
  type BerichtImportResult,
} from "../actions";
import { Button } from "@/components/ui";

/**
 * nuLiga-Spielbericht einfügen: komplette Spielbericht-Seite bei nuLiga
 * mit Strg+A markieren, Strg+C kopieren und hier mit Strg+V einfügen –
 * Einzel/Doppel und Endergebnis werden automatisch zugeordnet.
 */
export function SpielberichtImport({
  eventId,
  seasonId,
}: {
  eventId: string;
  seasonId: string;
}) {
  const [state, formAction, pending] = useActionState<
    BerichtImportResult | null,
    FormData
  >(importStatistik, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={eventId} />
      <input type="hidden" name="season_id" value={seasonId} />
      <p className="text-xs text-muted">
        Auf der nuLiga-Seite den <strong>Spielbericht</strong> öffnen, alles
        markieren (<strong>Strg+A</strong>), kopieren (<strong>Strg+C</strong>)
        und hier einfügen (<strong>Strg+V</strong>) – die Einzel/Doppel werden
        automatisch den Spielern zugeordnet und das Endergebnis gesetzt.
      </p>
      <textarea
        name="nuliga"
        rows={4}
        placeholder="Hier den kopierten nuLiga-Spielbericht einfügen …"
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Werte aus …" : "📋 Spielbericht auswerten"}
      </Button>
      {state && (
        <p className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
