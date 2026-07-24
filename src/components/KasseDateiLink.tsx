"use client";

import { useState } from "react";
import {
  kasseDateiUrl,
  auslageDateiUrl,
} from "@/app/mitglieder/kasse/actions";

/**
 * Öffnet eine geschützte Kassen-Datei über eine kurzlebige Signed-URL.
 * `quelle` = "datei" (Beleg/Auswertung, nur Kassierer) oder "auslage"
 * (eigener Auslagen-Beleg, per Antrags-ID).
 */
export function KasseDateiLink({
  wert,
  quelle,
  label = "📎 Beleg ansehen",
}: {
  wert: string; // Pfad (datei) oder Auslage-ID (auslage)
  quelle: "datei" | "auslage";
  label?: string;
}) {
  const [lädt, setLädt] = useState(false);
  const [fehler, setFehler] = useState("");

  async function öffnen() {
    setLädt(true);
    setFehler("");
    const url =
      quelle === "datei"
        ? await kasseDateiUrl(wert)
        : await auslageDateiUrl(wert);
    setLädt(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setFehler("Datei nicht verfügbar.");
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={öffnen}
        disabled={lädt}
        className="text-sm text-primary hover:underline disabled:opacity-60"
      >
        {lädt ? "Öffne …" : label}
      </button>
      {fehler && <span className="text-xs text-danger">{fehler}</span>}
    </span>
  );
}
