"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setHelfer } from "@/app/mitglieder/termine/spieltag-actions";

export interface HelferEintrag {
  name: string;
  aufgabe: string;
}

const AUFGABEN = ["🍺 Theke", "🔧 Aufbau", "🥨 Essen mitbringen"];

/**
 * Helferliste bei Heimspielen: Aufgabe antippen (oder eigene eintragen) –
 * jeder pflegt nur seinen eigenen Eintrag, alle sehen, wer was übernimmt.
 */
export function HelferSection({
  eventId,
  meineAufgabe,
  helfer,
}: {
  eventId: string;
  meineAufgabe: string | null;
  helfer: HelferEintrag[];
}) {
  const router = useRouter();
  const [aufgabe, setAufgabe] = useState(meineAufgabe);
  const [eigene, setEigene] = useState(
    meineAufgabe && !AUFGABEN.includes(meineAufgabe) ? meineAufgabe : "",
  );
  const [fehler, setFehler] = useState("");
  const [isPending, startTransition] = useTransition();

  function speichern(neue: string | null) {
    setAufgabe(neue);
    setFehler("");
    startTransition(async () => {
      const res = await setHelfer(eventId, neue);
      if (!res.ok) setFehler(res.message ?? "Fehler beim Speichern.");
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
      <p className="text-sm text-muted">
        Wer packt beim Heimspiel mit an? Aufgabe antippen – nochmal tippen
        trägt dich wieder aus.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {AUFGABEN.map((a) => (
          <button
            key={a}
            onClick={() => speichern(aufgabe === a ? null : a)}
            disabled={isPending}
            className={knopf(aufgabe === a)}
          >
            {a}
          </button>
        ))}
        <span className="flex items-center gap-1">
          <input
            value={eigene}
            onChange={(e) => setEigene(e.target.value)}
            placeholder="eigene Aufgabe …"
            maxLength={60}
            className="w-40 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button
            onClick={() => eigene.trim() && speichern(eigene.trim())}
            disabled={isPending || !eigene.trim()}
            className={knopf(!!aufgabe && aufgabe === eigene.trim())}
          >
            ✓
          </button>
        </span>
        {aufgabe && (
          <button
            onClick={() => speichern(null)}
            disabled={isPending}
            className="text-sm text-muted hover:underline"
          >
            ✕ Austragen
          </button>
        )}
      </div>

      {fehler && <p className="text-sm text-danger">⚠️ {fehler}</p>}

      <div className="text-sm">
        <p className="font-medium">🙌 Helfer</p>
        {helfer.length === 0 ? (
          <p className="text-muted">– noch niemand –</p>
        ) : (
          <ul className="text-muted">
            {helfer.map((h) => (
              <li key={h.name}>
                {h.name} – {h.aufgabe}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
