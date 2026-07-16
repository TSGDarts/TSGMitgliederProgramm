"use client";

import { useEffect, useState } from "react";

// Selbst anpassbare Menü-Reihenfolge: wird pro Gerät gespeichert
// (localStorage). Neue Menüpunkte, die es beim Speichern noch nicht gab,
// bleiben an ihrer Standard-Position hängen.

const KEY = "nav-reihenfolge";

export function useNavOrder<T extends { href: string }>(items: T[]) {
  const [order, setOrder] = useState<string[] | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setOrder(JSON.parse(raw) as string[]);
    } catch {
      // localStorage gesperrt – dann eben Standard-Reihenfolge
    }
  }, []);

  const sorted = order
    ? [...items].sort((a, b) => {
        const ia = order.indexOf(a.href);
        const ib = order.indexOf(b.href);
        const wa = ia === -1 ? order.length + items.indexOf(a) : ia;
        const wb = ib === -1 ? order.length + items.indexOf(b) : ib;
        return wa - wb;
      })
    : items;

  function move(href: string, delta: number) {
    const hrefs = sorted.map((i) => i.href);
    const idx = hrefs.indexOf(href);
    const ziel = idx + delta;
    if (idx < 0 || ziel < 0 || ziel >= hrefs.length) return;
    [hrefs[idx], hrefs[ziel]] = [hrefs[ziel], hrefs[idx]];
    setOrder(hrefs);
    try {
      localStorage.setItem(KEY, JSON.stringify(hrefs));
    } catch {}
  }

  function reset() {
    setOrder(null);
    try {
      localStorage.removeItem(KEY);
    } catch {}
  }

  return { sorted, move, reset, angepasst: !!order };
}
