"use client";

import { useState } from "react";
import { useActionState } from "react";
import {
  importStatistik,
  type BerichtImportResult,
} from "../actions";
import { Button } from "@/components/ui";

const feldKlasse =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-primary";

/**
 * Spielberichte für einen Spieltag einfügen: Erfassungsart wählen
 * (ohne Online / 3K Darts / Darthelfer), dann die jeweiligen Seiten per
 * Strg+A, Strg+C kopieren und hier einfügen – Spieler, Ergebnisse,
 * Averages und Bestleistungen werden automatisch zugeordnet.
 */
export function SpielberichtImport({
  eventId,
  seasonId,
  initialQuelle,
}: {
  eventId: string;
  seasonId: string;
  initialQuelle: string;
}) {
  const [quelle, setQuelle] = useState(initialQuelle || "");
  const [state, formAction, pending] = useActionState<
    BerichtImportResult | null,
    FormData
  >(importStatistik, null);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={eventId} />
      <input type="hidden" name="season_id" value={seasonId} />

      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Erfasst mit:</span>
        <select
          name="quelle"
          value={quelle}
          onChange={(e) => setQuelle(e.target.value)}
          className="rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
        >
          <option value="">ohne Online (nur nuLiga)</option>
          <option value="3k">3K Darts</option>
          <option value="darthelfer">Darthelfer</option>
        </select>
      </label>

      <p className="text-xs text-muted">
        Jeweils die komplette Seite markieren (<strong>Strg+A</strong>),
        kopieren (<strong>Strg+C</strong>) und ins Feld einfügen
        (<strong>Strg+V</strong>) – Spieler, Ergebnisse und Endergebnis
        werden automatisch zugeordnet.
      </p>

      <textarea
        name="nuliga"
        rows={3}
        placeholder="nuLiga-Spielbericht hier einfügen …"
        className={feldKlasse}
      />

      {quelle === "3k" && (
        <>
          <textarea
            name="k3_spiele"
            rows={3}
            placeholder="3K – Spiele-Ansicht hier einfügen (mit Averages) …"
            className={feldKlasse}
          />
          <textarea
            name="k3_best"
            rows={3}
            placeholder="3K – Bestleistungen hier einfügen (180er, Highfinish, Shortgame – optional) …"
            className={feldKlasse}
          />
          <textarea
            name="k3_stats"
            rows={3}
            placeholder="3K – Statistiken hier einfügen (Match-Averages – optional) …"
            className={feldKlasse}
          />
        </>
      )}

      {quelle === "darthelfer" && (
        <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
          Der Darthelfer-Import kommt als Nächstes – bis dahin bitte den
          nuLiga-Spielbericht einfügen.
        </p>
      )}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Werte aus …" : "📋 Berichte auswerten"}
      </Button>
      {state && (
        <p className={`text-sm ${state.ok ? "text-ok" : "text-danger"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
