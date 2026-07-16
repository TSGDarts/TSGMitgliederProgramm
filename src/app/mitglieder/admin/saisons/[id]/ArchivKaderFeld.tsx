"use client";

import { useState } from "react";

/**
 * Kader-Feld für Archiv-Einträge: Freitext (eine Person pro Zeile,
 * optional „C“/„VC“ am Ende) plus Auswahl der angelegten Mitglieder –
 * ausgewählte Namen werden als neue Zeile angehängt.
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

  function hinzufuegen() {
    if (!auswahl) return;
    const zeilen = text
      .split(/\r?\n/)
      .map((z) => z.trim())
      .filter(Boolean);
    const schonDrin = zeilen.some(
      (z) => z.replace(/[\s,;]+(C|VC)$/i, "").trim() === auswahl,
    );
    if (!schonDrin) setText([...zeilen, auswahl].join("\n"));
    setAuswahl("");
  }

  return (
    <div className="space-y-2">
      <textarea
        name="roster"
        rows={8}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={auswahl}
          onChange={(e) => setAuswahl(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-primary sm:max-w-xs"
        >
          <option value="">Mitglied auswählen …</option>
          {namen.map((n) => (
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
      <p className="text-xs text-muted">
        Eine Person pro Zeile – dahinter optional C (Kapitän) oder VC
        (Vize), z. B. „Max Muster C“. Namen, die es nicht mehr im Verein
        gibt, kannst du einfach von Hand dazuschreiben. Speichern nicht
        vergessen!
      </p>
    </div>
  );
}
