"use client";

import { useState } from "react";
import { mapsUrl } from "@/lib/extras";

/**
 * Adresse als Zeile: Klick öffnet Google Maps, daneben Kopieren & Teilen.
 */
export function AddressLine({
  address,
  className = "",
}: {
  address: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    const url = mapsUrl(address);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Adresse", text: address, url });
      } catch {
        // Abbruch durch Nutzer – kein Fehler
      }
    } else {
      await copy();
    }
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <a
        href={mapsUrl(address)}
        target="_blank"
        rel="noreferrer"
        title="In Google Maps öffnen"
        className="text-primary hover:underline"
      >
        📍 {address}
      </a>
      <button
        onClick={copy}
        title="Adresse kopieren"
        className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-border/40"
      >
        {copied ? "✓ kopiert" : "📋"}
      </button>
      <button
        onClick={share}
        title="Adresse teilen"
        className="rounded border border-border px-1.5 py-0.5 text-xs hover:bg-border/40"
      >
        📤
      </button>
    </span>
  );
}
