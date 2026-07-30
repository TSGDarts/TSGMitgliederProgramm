"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCarpool } from "@/app/mitglieder/termine/spieltag-actions";

export interface CarpoolFahrer {
  name: string;
  seats: number | null;
  ort: string;
  ziel: string;
  abfahrt: string;
}

export interface CarpoolMitfahrer {
  name: string;
  ort: string;
  ziel: string;
  abfahrt: string;
}

/** Google-Maps-Routen-Link (öffnet die Karten-App mit fertiger Route). */
function mapsRoute(origin: string, destination: string): string | null {
  if (!destination) return null;
  const p = new URLSearchParams({ api: "1", destination });
  if (origin) p.set("origin", origin);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/**
 * Fahrgemeinschaft am Termin: „Ich fahre" / „Ich suche eine
 * Mitfahrgelegenheit" mit optionaler Mini-Planung: von wo, Ziel, Abfahrt/
 * Zeit-Hinweis und ein „Route öffnen"-Link. Jeder pflegt nur seinen Eintrag.
 */
export function CarpoolSection({
  eventId,
  meineRolle,
  meineSeats,
  meinOrt,
  meinZiel,
  meineAbfahrt,
  zielVorgabe,
  fahrer,
  mitfahrer,
}: {
  eventId: string;
  meineRolle: "fahrer" | "mitfahrer" | null;
  meineSeats: number | null;
  meinOrt: string;
  meinZiel: string;
  meineAbfahrt: string;
  zielVorgabe: string; // Spielort (Standard-Ziel)
  fahrer: CarpoolFahrer[];
  mitfahrer: CarpoolMitfahrer[];
}) {
  const router = useRouter();
  const [rolle, setRolle] = useState(meineRolle);
  const [seats, setSeats] = useState(meineSeats ?? 3);
  const [ort, setOrt] = useState(meinOrt ?? "");
  const [ziel, setZiel] = useState(meinZiel ?? "");
  const [abfahrt, setAbfahrt] = useState(meineAbfahrt ?? "");
  const [isPending, startTransition] = useTransition();

  function speichern(
    neueRolle: "fahrer" | "mitfahrer" | null,
    override?: {
      seats?: number;
      ort?: string;
      ziel?: string;
      abfahrt?: string;
    },
  ) {
    setRolle(neueRolle);
    if (override?.seats != null) setSeats(override.seats);
    startTransition(async () => {
      await setCarpool(eventId, neueRolle, {
        seats: override?.seats ?? seats,
        ort: override?.ort ?? ort,
        ziel: override?.ziel ?? ziel,
        abfahrt: override?.abfahrt ?? abfahrt,
      });
      router.refresh();
    });
  }

  const knopf = (aktiv: boolean) =>
    `rounded-lg border px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 ${
      aktiv
        ? "border-ok bg-ok text-white"
        : "border-border bg-surface text-muted hover:text-foreground"
    }`;

  const feld =
    "w-full rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary";

  const meineRoute = mapsRoute(ort, ziel || zielVorgabe);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => speichern("fahrer")}
          disabled={isPending}
          className={knopf(rolle === "fahrer")}
        >
          🚗 Ich fahre
        </button>
        {rolle === "fahrer" && (
          <label className="flex items-center gap-1 text-sm">
            mit
            <select
              value={seats}
              onChange={(e) => speichern("fahrer", { seats: Number(e.target.value) })}
              className="rounded-lg border border-border bg-surface px-2 py-1 text-sm"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            freien Plätzen
          </label>
        )}
        <button
          onClick={() => speichern("mitfahrer")}
          disabled={isPending}
          className={knopf(rolle === "mitfahrer")}
        >
          🙋 Ich suche eine Mitfahrgelegenheit
        </button>
        {rolle && (
          <button
            onClick={() => speichern(null)}
            disabled={isPending}
            className="text-sm text-muted hover:underline"
          >
            ✕ Austragen
          </button>
        )}
      </div>

      {/* Mini-Planung: von wo, Ziel, Abfahrt + Route */}
      {rolle && (
        <div className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">
              📍 {rolle === "fahrer" ? "Startort" : "Von wo (Abholort)"}
            </span>
            <input
              value={ort}
              onChange={(e) => setOrt(e.target.value)}
              onBlur={() => ort !== (meinOrt ?? "") && speichern(rolle)}
              placeholder="z. B. Roth, Bahnhofstr."
              maxLength={80}
              className={feld}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">🎯 Ziel</span>
            <input
              value={ziel}
              onChange={(e) => setZiel(e.target.value)}
              onBlur={() => ziel !== (meinZiel ?? "") && speichern(rolle)}
              placeholder={zielVorgabe || "Spielort"}
              maxLength={80}
              className={feld}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">
              🕒 Abfahrt / Hinweis
            </span>
            <input
              value={abfahrt}
              onChange={(e) => setAbfahrt(e.target.value)}
              onBlur={() => abfahrt !== (meineAbfahrt ?? "") && speichern(rolle)}
              placeholder="z. B. 17:30 ab Roth"
              maxLength={80}
              className={feld}
            />
          </label>
          <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
            {meineRoute && (
              <a
                href={meineRoute}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline"
              >
                🗺 Route in Google Maps öffnen
              </a>
            )}
            <span className="text-xs text-muted">
              Ziel leer = Spielort. Wird automatisch gespeichert.
            </span>
          </div>
        </div>
      )}

      {(fahrer.length > 0 || mitfahrer.length > 0) && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="font-medium">🚗 Fahrer</p>
            {fahrer.length === 0 ? (
              <p className="text-muted">– noch niemand –</p>
            ) : (
              <ul className="space-y-1 text-muted">
                {fahrer.map((f) => (
                  <li key={f.name}>
                    <span className="text-foreground">{f.name}</span>
                    {f.seats ? ` (${f.seats} Plätze frei)` : ""}
                    {f.ort ? ` · ab ${f.ort}` : ""}
                    {f.ziel ? ` → ${f.ziel}` : ""}
                    {f.abfahrt ? ` · 🕒 ${f.abfahrt}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="font-medium">🙋 Suchen eine Mitfahrgelegenheit</p>
            {mitfahrer.length === 0 ? (
              <p className="text-muted">– noch niemand –</p>
            ) : (
              <ul className="space-y-1 text-muted">
                {mitfahrer.map((m) => (
                  <li key={m.name}>
                    <span className="text-foreground">{m.name}</span>
                    {m.ort ? ` · von ${m.ort}` : ""}
                    {m.ziel ? ` → ${m.ziel}` : ""}
                    {m.abfahrt ? ` · 🕒 ${m.abfahrt}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
