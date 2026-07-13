"use client";

import { useActionState } from "react";
import { importNuligaIcal, type ImportResult } from "../actions";
import { Button } from "@/components/ui";

export function ImportButton({
  teamId,
  icalUrl,
}: {
  teamId: string;
  icalUrl: string;
}) {
  const [state, formAction, pending] = useActionState<
    ImportResult | null,
    FormData
  >(importNuligaIcal, null);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="team_id" value={teamId} />
        <input type="hidden" name="ical_url" value={icalUrl} />
        <Button type="submit" variant="secondary" disabled={pending || !icalUrl}>
          {pending ? "Importiere …" : "Termine aus nuLiga importieren"}
        </Button>
      </form>
      {!icalUrl && (
        <p className="text-xs text-muted">
          Zuerst oben die iCal-Adresse speichern.
        </p>
      )}
      {state && (
        <p
          className={`text-sm ${
            state.ok ? "text-ok" : "text-danger"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
