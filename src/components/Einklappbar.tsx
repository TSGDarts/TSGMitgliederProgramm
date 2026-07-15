"use client";

import { useEffect, useRef } from "react";

/**
 * Aufklappbarer Bereich, der sich seinen Zustand merkt (localStorage pro
 * Gerät): einmal zugeklappt, bleibt er beim nächsten Besuch zugeklappt.
 */
export function Einklappbar({
  id,
  title,
  defaultOpen = true,
  zuklappBei,
  className = "",
  children,
}: {
  id: string;
  title: React.ReactNode;
  defaultOpen?: boolean;
  /** Ändert sich dieser Wert (z. B. ?gespeichert=…), klappt der Bereich zu. */
  zuklappBei?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const geladen = useRef(false);
  const signal = useRef(zuklappBei);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`einklappen:${id}`);
      if (saved !== null && ref.current) ref.current.open = saved === "1";
    } catch {
      // localStorage gesperrt (z. B. Privatmodus) – dann eben ohne Merken
    }
    geladen.current = true;
  }, [id]);

  // Nach dem Speichern (Signal wechselt) zuklappen – und das auch merken
  useEffect(() => {
    if (signal.current === zuklappBei) return;
    signal.current = zuklappBei;
    if (ref.current) ref.current.open = false;
    try {
      localStorage.setItem(`einklappen:${id}`, "0");
    } catch {}
  }, [zuklappBei, id]);

  return (
    <details
      ref={ref}
      open={defaultOpen}
      onToggle={(e) => {
        if (!geladen.current) return;
        try {
          localStorage.setItem(
            `einklappen:${id}`,
            (e.currentTarget as HTMLDetailsElement).open ? "1" : "0",
          );
        } catch {}
      }}
      className={`group rounded-xl border border-border bg-surface ${className}`}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">{title}</span>
        <span
          aria-hidden
          className="shrink-0 text-muted transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="border-t border-border p-5">{children}</div>
    </details>
  );
}
