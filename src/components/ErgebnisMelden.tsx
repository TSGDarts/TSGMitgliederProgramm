"use client";

import { useActionState } from "react";
import {
  meldeErgebnis,
  type ErgebnisResult,
} from "@/app/mitglieder/termine/spieltag-actions";
import { Button } from "@/components/ui";

/**
 * Ergebnis melden (Kapitän/Vize/Bearbeiter/Admin): Endergebnis von Hand
 * eintragen oder gleich den kompletten nuLiga-Spielbericht einfügen –
 * dann zählt auch die Spielerstatistik mit. Beim ersten Ergebnis wird
 * der Verein automatisch benachrichtigt.
 */
export function ErgebnisMelden({
  eventId,
  initialResult,
}: {
  eventId: string;
  initialResult: string;
}) {
  const [state, formAction, pending] = useActionState<
    ErgebnisResult | null,
    FormData
  >(meldeErgebnis, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="event_id" value={eventId} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">
            Endergebnis (aus unserer Sicht)
          </span>
          <input
            name="result"
            defaultValue={initialResult}
            placeholder="z. B. 12:6"
            className="w-32 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </label>
        <Button type="submit" disabled={pending}>
          {pending ? "Speichert …" : "🏁 Ergebnis melden"}
        </Button>
      </div>
      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-primary">
          📋 Oder gleich den nuLiga-Spielbericht einfügen (für die
          Spielerstatistik)
        </summary>
        <div className="space-y-2 border-t border-border p-3">
          <p className="text-xs text-muted">
            Bei nuLiga den Spielbericht öffnen, alles markieren
            (<strong>Strg+A</strong>), kopieren (<strong>Strg+C</strong>)
            und hier einfügen – Endergebnis und alle Einzel/Doppel werden
            automatisch übernommen.
          </p>
          <textarea
            name="bericht"
            rows={4}
            placeholder="Hier den kopierten Spielbericht einfügen …"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary"
          />
        </div>
      </details>
      <p className="text-xs text-muted">
        Beim ersten Ergebnis bekommt der Verein automatisch eine
        Benachrichtigung.
      </p>
      {state && (
        <p className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
