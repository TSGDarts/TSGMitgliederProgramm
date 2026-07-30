"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setCarpool } from "@/app/mitglieder/termine/spieltag-actions";

export interface CarpoolFahrer {
  profileId: string;
  name: string;
  seats: number | null;
  ort: string;
  ziel: string;
  abfahrt: string;
}

export interface CarpoolMitfahrer {
  profileId: string;
  name: string;
  ort: string;
  ziel: string;
  abfahrt: string;
  fahrerId: string | null;
}

/** Google-Maps-Routen-Link – mit optionalen Zwischenstopps (Abholorte). */
function mapsRoute(
  origin: string,
  destination: string,
  waypoints: string[] = [],
): string | null {
  if (!destination) return null;
  const p = new URLSearchParams({ api: "1", destination });
  if (origin) p.set("origin", origin);
  const stops = waypoints.filter(Boolean);
  if (stops.length) p.set("waypoints", stops.join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/**
 * Fahrgemeinschaft am Termin mit Mini-Planung: „Ich fahre" / „Ich suche eine
 * Mitfahrgelegenheit", je mit Startort, Ziel und Abfahrts-Hinweis. Mitfahrer
 * können angeben, bei WEM sie mitfahren; jeder Fahrer bekommt dann eine
 * Sammel-Route (Startort → Abholorte der Mitfahrer → Ziel).
 */
export function CarpoolSection({
  eventId,
  meineRolle,
  meineSeats,
  meinOrt,
  meinZiel,
  meineAbfahrt,
  meinFahrerId,
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
  meinFahrerId: string | null;
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
  const [fahrerId, setFahrerId] = useState(meinFahrerId ?? "");
  const [isPending, startTransition] = useTransition();

  function speichern(
    neueRolle: "fahrer" | "mitfahrer" | null,
    override?: {
      seats?: number;
      ort?: string;
      ziel?: string;
      abfahrt?: string;
      fahrerId?: string;
    },
  ) {
    setRolle(neueRolle);
    if (override?.seats != null) setSeats(override.seats);
    if (override?.fahrerId != null) setFahrerId(override.fahrerId);
    startTransition(async () => {
      await setCarpool(eventId, neueRolle, {
        seats: override?.seats ?? seats,
        ort: override?.ort ?? ort,
        ziel: override?.ziel ?? ziel,
        abfahrt: override?.abfahrt ?? abfahrt,
        fahrerId: override?.fahrerId ?? fahrerId,
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

  const fahrerName = (id: string | null) =>
    fahrer.find((f) => f.profileId === id)?.name ?? null;

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

      {/* Mini-Planung: von wo, Ziel, Abfahrt (+ bei wem ich mitfahre) */}
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

          {/* Mitfahrer: bei welchem Fahrer? */}
          {rolle === "mitfahrer" && fahrer.length > 0 && (
            <label className="text-sm sm:col-span-3">
              <span className="mb-1 block text-xs text-muted">
                🚗 Ich fahre mit
              </span>
              <select
                value={fahrerId}
                onChange={(e) => speichern("mitfahrer", { fahrerId: e.target.value })}
                className={feld}
              >
                <option value="">– noch offen –</option>
                {fahrer.map((f) => (
                  <option key={f.profileId} value={f.profileId}>
                    {f.name}
                    {f.ort ? ` (ab ${f.ort})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="sm:col-span-3 text-xs text-muted">
            Ziel leer = Spielort. Wird automatisch gespeichert.
          </div>
        </div>
      )}

      {(fahrer.length > 0 || mitfahrer.length > 0) && (
        <div className="space-y-3 text-sm">
          {/* Fahrer mit ihren Mitfahrern + Sammel-Route */}
          <div>
            <p className="font-medium">🚗 Fahrer</p>
            {fahrer.length === 0 ? (
              <p className="text-muted">– noch niemand –</p>
            ) : (
              <ul className="space-y-2">
                {fahrer.map((f) => {
                  const meine = mitfahrer.filter((m) => m.fahrerId === f.profileId);
                  const route = mapsRoute(
                    f.ort,
                    f.ziel || zielVorgabe,
                    meine.map((m) => m.ort),
                  );
                  return (
                    <li key={f.profileId} className="rounded-lg bg-border/15 px-3 py-2">
                      <div className="text-muted">
                        <span className="font-medium text-foreground">
                          {f.name}
                        </span>
                        {f.seats
                          ? ` · ${meine.length}/${f.seats} belegt`
                          : ""}
                        {f.ort ? ` · ab ${f.ort}` : ""}
                        {f.ziel ? ` → ${f.ziel}` : ""}
                        {f.abfahrt ? ` · 🕒 ${f.abfahrt}` : ""}
                      </div>
                      {meine.length > 0 && (
                        <div className="mt-1 text-muted">
                          Mitfahrer:{" "}
                          {meine
                            .map((m) => `${m.name}${m.ort ? ` (${m.ort})` : ""}`)
                            .join(", ")}
                        </div>
                      )}
                      {route && (
                        <a
                          href={route}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-primary hover:underline"
                        >
                          🗺 Route{meine.length ? " mit Mitfahrern" : ""} öffnen
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Wer noch keine Mitfahrgelegenheit hat */}
          {mitfahrer.length > 0 && (
            <div>
              <p className="font-medium">🙋 Suchen eine Mitfahrgelegenheit</p>
              <ul className="space-y-1 text-muted">
                {mitfahrer.map((m) => (
                  <li key={m.profileId}>
                    <span className="text-foreground">{m.name}</span>
                    {m.ort ? ` · von ${m.ort}` : ""}
                    {m.ziel ? ` → ${m.ziel}` : ""}
                    {m.abfahrt ? ` · 🕒 ${m.abfahrt}` : ""}
                    {m.fahrerId
                      ? ` · ✅ fährt mit ${fahrerName(m.fahrerId) ?? "?"}`
                      : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
