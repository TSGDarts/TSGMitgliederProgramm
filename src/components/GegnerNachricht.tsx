"use client";

import { useState } from "react";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

/**
 * Vorgefertigte Nachricht an den Gegner vor Heimspielen (Platzhalter sind
 * bereits gefüllt). Vor dem Verschicken noch anpassbar, dann kopieren
 * oder direkt an WhatsApp übergeben.
 */
export function GegnerNachricht({
  text,
  recipientName,
  phone,
  email,
  whatsappNumber,
}: {
  text: string;
  recipientName: string;
  phone: string;
  email: string;
  whatsappNumber: string;
}) {
  const [nachricht, setNachricht] = useState(text);
  const [kopiert, setKopiert] = useState(false);
  const whatsappUrl = whatsappNumber
    ? `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(nachricht)}`
    : `https://wa.me/?text=${encodeURIComponent(nachricht)}`;

  return (
    <div className="space-y-2">
      {recipientName && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-primary/5 px-3 py-2 text-sm">
          <span className="font-medium">Empfänger: {recipientName}</span>
          {phone && (
            <a href={`tel:${phone}`} className="text-primary hover:underline">
              {phone}
            </a>
          )}
          {email && (
            <a
              href={`mailto:${email}`}
              className="text-primary hover:underline"
            >
              {email}
            </a>
          )}
        </div>
      )}
      <textarea
        value={nachricht}
        onChange={(e) => setNachricht(e.target.value)}
        rows={12}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(nachricht);
              setKopiert(true);
              setTimeout(() => setKopiert(false), 2000);
            } catch {}
          }}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
        >
          {kopiert ? "✓ Kopiert" : "📋 Kopieren"}
        </button>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <WhatsAppIcon /> In WhatsApp öffnen
        </a>
        {email && (
          <a
            href={`mailto:${email}?subject=${encodeURIComponent("Heimspiel bei der TSG 08 Roth")}&body=${encodeURIComponent(nachricht)}`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
          >
            ✉️ Als E-Mail öffnen
          </a>
        )}
      </div>
      {recipientName && phone && !whatsappNumber && (
        <p className="text-xs text-danger">
          Die veröffentlichte Nummer ist kein eindeutig gültiges deutsches
          Mobilformat. WhatsApp öffnet deshalb ohne vorausgewählten Empfänger.
        </p>
      )}
      <p className="text-xs text-muted">
        Die Vorlage pflegt der Admin unter „Gegner verwalten“ – hier sind die
        Platzhalter (Ansprechpartner, Datum, Uhrzeit …) schon ausgefüllt.
      </p>
    </div>
  );
}
