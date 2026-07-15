"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveLineup,
  type LineupEintrag,
} from "@/app/mitglieder/termine/spieltag-actions";

export interface RosterEintrag {
  id: string;
  name: string;
}

/**
 * Aufstellung fürs Spiel: Kapitän/Vize stellt sie als Entwurf zusammen
 * (nur für ihn sichtbar) und gibt sie dann an die Mannschaft frei –
 * das löst eine Push-Nachricht an den Kader aus. Dazu gibt es einen
 * fertigen Text (Aufstellung + Treffpunkt + Beginn) für WhatsApp & Co.
 */
export function LineupSection({
  eventId,
  canManage,
  released,
  initialEntries,
  roster,
  kopfzeilen,
}: {
  eventId: string;
  canManage: boolean;
  released: boolean;
  initialEntries: LineupEintrag[];
  roster: RosterEintrag[];
  kopfzeilen: string[]; // Titel, Datum/Beginn, Treffpunkte, Ort
}) {
  const router = useRouter();
  const [entries, setEntries] = useState<LineupEintrag[]>(
    initialEntries.length > 0
      ? initialEntries
      : [{ profile_id: null, name: "" }, { profile_id: null, name: "" }],
  );
  const [istFreigegeben, setIstFreigegeben] = useState(released);
  const [meldung, setMeldung] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const [isPending, startTransition] = useTransition();

  const gefuellt = entries.filter((e) => e.name.trim());

  function textErzeugen(): string {
    const zeilen = [
      ...kopfzeilen,
      "",
      ...gefuellt.map((e, i) => `${i + 1}. ${e.name}`),
    ];
    return zeilen.join("\n");
  }

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(textErzeugen());
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {}
  }

  function speichern(aktion: "entwurf" | "freigeben") {
    setMeldung("");
    startTransition(async () => {
      const res = await saveLineup(eventId, entries, aktion);
      if (!res.ok) {
        setMeldung(res.message ?? "Konnte nicht gespeichert werden.");
        return;
      }
      if (aktion === "freigeben") setIstFreigegeben(true);
      setMeldung(
        aktion === "freigeben"
          ? "✅ Freigegeben – die Mannschaft wurde benachrichtigt."
          : "✓ Entwurf gespeichert (nur für dich sichtbar).",
      );
      router.refresh();
    });
  }

  // Nur-Lese-Ansicht für die Mannschaft
  if (!canManage) {
    if (!istFreigegeben || gefuellt.length === 0) return null;
    return (
      <ol className="list-inside list-decimal space-y-1 text-sm">
        {gefuellt.map((e, i) => (
          <li key={`${e.name}-${i}`}>{e.name}</li>
        ))}
      </ol>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm">
        {istFreigegeben ? (
          <span className="font-medium text-ok">
            ✅ Freigegeben – für die Mannschaft sichtbar
          </span>
        ) : (
          <span className="font-medium text-warn">
            🔒 Entwurf – nur für dich sichtbar, bis du freigibst
          </span>
        )}
      </p>

      <div className="space-y-2">
        {entries.map((eintrag, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-6 text-right text-sm text-muted">{i + 1}.</span>
            <select
              value={eintrag.profile_id ?? ""}
              onChange={(e) => {
                const id = e.target.value;
                const spieler = roster.find((r) => r.id === id);
                setEntries((prev) =>
                  prev.map((x, j) =>
                    j === i
                      ? { profile_id: id || null, name: spieler?.name ?? "" }
                      : x,
                  ),
                );
              }}
              className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm"
            >
              <option value="">– Spieler wählen –</option>
              {roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                setEntries((prev) => prev.filter((_, j) => j !== i))
              }
              title="Zeile entfernen"
              className="rounded-lg border border-border px-2 py-1 text-sm hover:bg-border/40"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setEntries((prev) => [...prev, { profile_id: null, name: "" }])
          }
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-border/40"
        >
          ＋ Zeile hinzufügen
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => speichern("entwurf")}
          disabled={isPending}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40 disabled:opacity-60"
        >
          Entwurf speichern
        </button>
        <button
          type="button"
          onClick={() => speichern("freigeben")}
          disabled={isPending || gefuellt.length === 0}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-60"
        >
          ✅ An die Mannschaft freigeben
        </button>
        <button
          type="button"
          onClick={kopieren}
          disabled={gefuellt.length === 0}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40 disabled:opacity-60"
        >
          {kopiert ? "✓ Kopiert" : "📋 Text für WhatsApp kopieren"}
        </button>
      </div>
      {meldung && <p className="text-sm text-muted">{meldung}</p>}
    </div>
  );
}
