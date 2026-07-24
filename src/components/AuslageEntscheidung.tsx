"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { entscheideAuslage } from "@/app/mitglieder/kasse/actions";

/** Kassierer-Knöpfe für einen Auslage-Antrag (mit optionalem Hinweis). */
export function AuslageEntscheidung({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [fehler, setFehler] = useState("");
  const [pending, start] = useTransition();

  function tun(neu: "genehmigt" | "abgelehnt" | "ausgezahlt") {
    setFehler("");
    start(async () => {
      const res = await entscheideAuslage(id, neu, note);
      if (!res.ok) setFehler(res.message ?? "Fehler.");
      else {
        setNote("");
        router.refresh();
      }
    });
  }

  const knopf =
    "rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-60";

  return (
    <div className="space-y-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Hinweis an den Antragsteller (optional)"
        className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary"
      />
      <div className="flex flex-wrap gap-2">
        {status !== "genehmigt" && status !== "ausgezahlt" && (
          <button
            onClick={() => tun("genehmigt")}
            disabled={pending}
            className={`${knopf} bg-ok text-white`}
          >
            ✅ Genehmigen
          </button>
        )}
        {status !== "ausgezahlt" && (
          <button
            onClick={() => tun("ausgezahlt")}
            disabled={pending}
            className={`${knopf} bg-primary text-primary-fg`}
          >
            💶 Ausgezahlt
          </button>
        )}
        {status !== "abgelehnt" && (
          <button
            onClick={() => tun("abgelehnt")}
            disabled={pending}
            className={`${knopf} border border-danger text-danger`}
          >
            ❌ Ablehnen
          </button>
        )}
      </div>
      {fehler && <p className="text-xs text-danger">⚠️ {fehler}</p>}
    </div>
  );
}
