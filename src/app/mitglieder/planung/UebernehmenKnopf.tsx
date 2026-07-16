"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uebernehmeEntwurf } from "./actions";

/** Admin-Knopf: Entwurf nach Rückfrage in die echten Mannschaften übernehmen. */
export function UebernehmenKnopf({
  planId,
  besitzer,
}: {
  planId: string;
  besitzer: string;
}) {
  const router = useRouter();
  const [meldung, setMeldung] = useState("");
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              `Den Entwurf von ${besitzer} wirklich übernehmen?\n\nDie Kader ALLER Mannschaften (inkl. Kapitäne/Vize) werden durch diesen Entwurf ersetzt.`,
            )
          ) {
            return;
          }
          setMeldung("");
          startTransition(async () => {
            const res = await uebernehmeEntwurf(planId);
            setMeldung(
              res.ok
                ? "✅ Übernommen – die Mannschaften sind aktualisiert."
                : `⚠️ ${res.message ?? "Das hat nicht geklappt."}`,
            );
            if (res.ok) router.refresh();
          });
        }}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-40"
      >
        {pending ? "Übernimmt …" : "✅ In die Mannschaften übernehmen"}
      </button>
      {meldung && <span className="text-sm">{meldung}</span>}
    </div>
  );
}
