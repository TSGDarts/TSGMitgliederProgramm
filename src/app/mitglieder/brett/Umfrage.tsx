"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abstimmen } from "./actions";
import { Button } from "@/components/ui";

export interface UmfrageDaten {
  id: string;
  question: string;
  options: string[];
  multi: boolean;
  open: boolean;
  namenJeOption: string[][]; // wer hat was gewählt
  meineAuswahl: number[];
}

/** Abstimmen + Ergebnisbalken einer Umfrage. */
export function Umfrage({ daten }: { daten: UmfrageDaten }) {
  const router = useRouter();
  const [auswahl, setAuswahl] = useState<number[]>(daten.meineAuswahl);
  const [meldung, setMeldung] = useState("");
  const [pending, startTransition] = useTransition();

  const stimmenGesamt = daten.namenJeOption.reduce(
    (summe, n) => summe + n.length,
    0,
  );
  const max = Math.max(1, ...daten.namenJeOption.map((n) => n.length));

  function waehle(index: number) {
    if (!daten.open) return;
    if (daten.multi) {
      setAuswahl(
        auswahl.includes(index)
          ? auswahl.filter((i) => i !== index)
          : [...auswahl, index],
      );
    } else {
      setAuswahl([index]);
    }
  }

  return (
    <div className="space-y-2">
      {daten.options.map((option, i) => {
        const namen = daten.namenJeOption[i] ?? [];
        return (
          <label
            key={i}
            className={`block rounded-lg border px-3 py-2 ${
              daten.open ? "cursor-pointer" : ""
            } ${
              auswahl.includes(i)
                ? "border-primary bg-primary/5"
                : "border-border"
            }`}
          >
            <span className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                {daten.open && (
                  <input
                    type={daten.multi ? "checkbox" : "radio"}
                    checked={auswahl.includes(i)}
                    onChange={() => waehle(i)}
                  />
                )}
                <span className="font-medium">{option}</span>
              </span>
              <span className="shrink-0 text-muted">{namen.length}</span>
            </span>
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-border/60">
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${(namen.length / max) * 100}%` }}
              />
            </span>
            {namen.length > 0 && (
              <span className="mt-1 block text-xs text-muted">
                {namen.join(", ")}
              </span>
            )}
          </label>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        {daten.open ? (
          <Button
            type="button"
            disabled={pending || auswahl.length === 0}
            onClick={() => {
              setMeldung("");
              startTransition(async () => {
                const res = await abstimmen(daten.id, auswahl);
                setMeldung(
                  res.ok ? "✅ Stimme gespeichert." : `⚠️ ${res.message}`,
                );
                if (res.ok) router.refresh();
              });
            }}
          >
            {pending
              ? "Speichert …"
              : daten.meineAuswahl.length
                ? "Stimme ändern"
                : "Abstimmen"}
          </Button>
        ) : (
          <span className="text-sm text-muted">Umfrage geschlossen.</span>
        )}
        <span className="text-xs text-muted">
          {stimmenGesamt} Stimme{stimmenGesamt === 1 ? "" : "n"}
          {daten.multi ? " · Mehrfachauswahl möglich" : ""}
        </span>
        {meldung && <span className="text-sm">{meldung}</span>}
      </div>
    </div>
  );
}
