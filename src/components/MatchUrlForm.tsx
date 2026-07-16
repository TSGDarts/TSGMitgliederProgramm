"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveMatchUrl } from "@/app/mitglieder/termine/spieltag-actions";

/**
 * 2k-Link zum Spiel pflegen (Kapitän/Vize/Bearbeiter/Admin): wird für
 * alle auf der Terminseite angezeigt und automatisch in die
 * Heimspiel-Nachricht an den Gegner eingebaut.
 */
export function MatchUrlForm({
  eventId,
  initialUrl,
}: {
  eventId: string;
  initialUrl: string;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [meldung, setMeldung] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">
        Link zum Spiel in der 2k-Software (z. B. von 2k-dart-software.com
        kopiert). Er erscheint für alle auf dieser Seite und wird
        automatisch in die Heimspiel-Nachricht an den Gegner übernommen.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.2k-dart-software.com/…"
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setMeldung("");
            startTransition(async () => {
              const res = await saveMatchUrl(eventId, url);
              setMeldung(
                res.ok
                  ? "✓ Gespeichert."
                  : `⚠️ ${res.message ?? "Speichern fehlgeschlagen."}`,
              );
              if (res.ok) router.refresh();
            });
          }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40"
        >
          {pending ? "Speichert …" : "Speichern"}
        </button>
      </div>
      {meldung && <p className="text-sm">{meldung}</p>}
    </div>
  );
}
