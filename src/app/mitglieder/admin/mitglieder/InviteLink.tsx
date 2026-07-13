"use client";

import { useState } from "react";

export function InviteLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
      <p className="mb-2 text-sm font-medium">
        Diesen Link an die Person senden (z. B. per WhatsApp/E-Mail). Damit setzt
        sie einmalig ihr Passwort:
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
        />
        <button
          onClick={copy}
          className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg"
        >
          {copied ? "Kopiert!" : "Kopieren"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Hinweis: Der Link ist aus Sicherheitsgründen nur begrenzt gültig. Falls
        er abläuft, einfach einen neuen erzeugen.
      </p>
    </div>
  );
}
