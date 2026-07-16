"use client";

import { useState } from "react";

/**
 * Kader-Feld für Archiv-Einträge: Chips mit ✕ (entfernen) und 👑
 * (Kapitän → Vize → nichts), Auswahl der angelegten Mitglieder zum
 * Hinzufügen – und darunter das Textfeld für Spezialfälle (eine Person
 * pro Zeile, optional „C“/„VC“ am Ende).
 */
export function ArchivKaderFeld({
  initialText,
  namen,
}: {
  initialText: string;
  namen: string[];
}) {
  const [text, setText] = useState(initialText);
  const [auswahl, setAuswahl] = useState("");

  type Zeile = { name: string; rolle: "" | "C" | "VC" };
  const zeilen: Zeile[] = text
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
    .map((zeile) => {
      const m = zeile.match(/^(.*?)[\s,;]+(C|VC)$/i);
      return {
        name: (m ? m[1] : zeile).trim(),
        rolle: (m ? (m[2].toUpperCase() as "C" | "VC") : "") as Zeile["rolle"],
      };
    });

  const schreibe = (liste: Zeile[]) =>
    setText(
      liste.map((z) => z.name + (z.rolle ? ` ${z.rolle}` : "")).join("\n"),
    );

  function entferne(name: string) {
    schreibe(zeilen.filter((z) => z.name !== name));
  }

  /** Rolle durchschalten: Spieler → Kapitän → Vize → Spieler (je einmal). */
  function rolleWechseln(name: string) {
    const aktuell = zeilen.find((z) => z.name === name)?.rolle ?? "";
    const neu: Zeile["rolle"] =
      aktuell === "" ? "C" : aktuell === "C" ? "VC" : "";
    schreibe(
      zeilen.map((z) => {
        if (z.name === name) return { ...z, rolle: neu };
        if (neu !== "" && z.rolle === neu) return { ...z, rolle: "" };
        return z;
      }),
    );
  }

  function hinzufuegen() {
    if (!auswahl) return;
    if (!zeilen.some((z) => z.name === auswahl)) {
      schreibe([...zeilen, { name: auswahl, rolle: "" }]);
    }
    setAuswahl("");
  }

  return (
    <div className="space-y-2">
      {zeilen.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {zeilen.map((z) => (
            <span
              key={z.name}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                z.rolle === "C"
                  ? "bg-primary text-primary-fg"
                  : z.rolle === "VC"
                    ? "bg-primary/30 text-primary"
                    : "bg-border/40"
              }`}
            >
              {z.rolle === "C" && <span title="Kapitän">👑</span>}
              {z.rolle === "VC" && (
                <span className="text-xs font-bold" title="Vize-Kapitän">
                  VC
                </span>
              )}
              {z.name}
              <button
                type="button"
                onClick={() => rolleWechseln(z.name)}
                className="ml-0.5 opacity-60 hover:opacity-100"
                title={
                  z.rolle === ""
                    ? "Zum Kapitän machen"
                    : z.rolle === "C"
                      ? "Zum Vize-Kapitän machen"
                      : "Rolle entfernen"
                }
              >
                👑
              </button>
              <button
                type="button"
                onClick={() => entferne(z.name)}
                className="ml-0.5 hover:opacity-70"
                title="Aus dem Kader entfernen"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={auswahl}
          onChange={(e) => setAuswahl(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary sm:max-w-xs"
        >
          <option value="">Mitglied auswählen …</option>
          {namen
            .filter((n) => !zeilen.some((z) => z.name === n))
            .map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
        </select>
        <button
          type="button"
          onClick={hinzufuegen}
          disabled={!auswahl}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-border/40 disabled:opacity-40"
        >
          ➕ In den Kader
        </button>
      </div>

      <details className="rounded-lg border border-border">
        <summary className="cursor-pointer px-3 py-1.5 text-xs font-medium text-muted">
          ✏️ Als Text bearbeiten
        </summary>
        <div className="border-t border-border p-2">
          <textarea
            name="roster"
            rows={8}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <p className="mt-1 text-xs text-muted">
            Eine Person pro Zeile – dahinter optional C (Kapitän) oder VC
            (Vize). Namen, die es nicht mehr im Verein gibt, hier von Hand
            dazuschreiben.
          </p>
        </div>
      </details>
      <p className="text-xs text-muted">Speichern nicht vergessen!</p>
    </div>
  );
}
