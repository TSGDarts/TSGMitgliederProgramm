"use client";

import { useEffect, useState } from "react";

/** Umschalter zwischen hellem und dunklem Design (merkt sich die Wahl). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    const saved = document.documentElement.dataset.theme;
    if (saved === "light" || saved === "dark") {
      setMode(saved);
    } else {
      setMode(
        window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light",
      );
    }
  }, []);

  function toggle() {
    const next = mode === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Speicher nicht verfügbar – Umschalten klappt trotzdem für die Sitzung
    }
    setMode(next);
  }

  return (
    <button
      onClick={toggle}
      title={
        mode === "dark"
          ? "Zum hellen Design wechseln"
          : "Zum dunklen Design wechseln"
      }
      className={`inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-border/40 ${className}`}
    >
      {mode === null ? "◐" : mode === "dark" ? "☀️" : "🌙"}
      <span className="sr-only">Design umschalten</span>
    </button>
  );
}
