"use client";

import { useState } from "react";

/**
 * Abo-Knopf für den öffentlichen ICS-Kalender: webcal:// öffnet direkt die
 * Kalender-App (iPhone/Mac sofort, Android je nach Kalender-App); als
 * Ausweichweg lässt sich die Adresse kopieren und im Kalender als
 * Abo-Kalender eintragen.
 */
export function CalendarSubscribe({ icsUrl }: { icsUrl: string }) {
  const [copied, setCopied] = useState(false);
  const webcalUrl = icsUrl.replace(/^https?:\/\//i, "webcal://");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={webcalUrl}
        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90"
      >
        📅 Kalender abonnieren
      </a>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(icsUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Zwischenablage nicht verfügbar – kein Drama, Knopf bleibt nutzbar
          }
        }}
        className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
      >
        {copied ? "✓ Kopiert" : "📋 Adresse kopieren"}
      </button>
    </div>
  );
}
