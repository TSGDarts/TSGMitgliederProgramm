"use client";

import { useEffect, useState } from "react";

// Selbst anpassbare Menü-Reihenfolge: wird pro Gerät gespeichert
// (localStorage). Neue Menüpunkte, die es beim Speichern noch nicht gab,
// bleiben an ihrer Standard-Position hängen.

const KEY = "nav-reihenfolge";
const CHANGE_EVENT = "nav-reihenfolge-geaendert";

function gespeicherteReihenfolge(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) &&
      parsed.every((wert) => typeof wert === "string")
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function useNavOrder<T extends { href: string }>(items: T[]) {
  const [order, setOrder] = useState<string[] | null>(null);

  useEffect(() => {
    const ausSpeicher = () => {
      try {
        setOrder(gespeicherteReihenfolge(localStorage.getItem(KEY)));
      } catch {
        // localStorage gesperrt – dann eben Standard-Reihenfolge
      }
    };
    const beiAenderung = (event: Event) => {
      setOrder((event as CustomEvent<string[] | null>).detail);
    };
    const beiSpeicherAenderung = (event: StorageEvent) => {
      if (event.key === KEY) {
        setOrder(gespeicherteReihenfolge(event.newValue));
      }
    };

    ausSpeicher();
    window.addEventListener(CHANGE_EVENT, beiAenderung);
    window.addEventListener("storage", beiSpeicherAenderung);
    return () => {
      window.removeEventListener(CHANGE_EVENT, beiAenderung);
      window.removeEventListener("storage", beiSpeicherAenderung);
    };
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

  function speichern(hrefs: string[] | null) {
    setOrder(hrefs);
    try {
      if (hrefs) {
        localStorage.setItem(KEY, JSON.stringify(hrefs));
      } else {
        localStorage.removeItem(KEY);
      }
    } catch {
      // Reihenfolge bleibt für die aktuelle Ansicht trotzdem erhalten.
    }
    window.dispatchEvent(
      new CustomEvent<string[] | null>(CHANGE_EVENT, { detail: hrefs }),
    );
  }

  function aktuelleHrefs() {
    return sorted.map((item) => item.href);
  }

  function move(href: string, delta: number) {
    const hrefs = aktuelleHrefs();
    const idx = hrefs.indexOf(href);
    const ziel = idx + delta;
    if (idx < 0 || ziel < 0 || ziel >= hrefs.length) return;
    [hrefs[idx], hrefs[ziel]] = [hrefs[ziel], hrefs[idx]];
    speichern(hrefs);
  }

  function moveTo(href: string, zielHref: string) {
    if (href === zielHref) return;
    const hrefs = aktuelleHrefs();
    const von = hrefs.indexOf(href);
    const ziel = hrefs.indexOf(zielHref);
    if (von < 0 || ziel < 0) return;
    hrefs.splice(von, 1);
    hrefs.splice(ziel, 0, href);
    speichern(hrefs);
  }

  function reset() {
    speichern(null);
  }

  return { sorted, move, moveTo, reset, angepasst: !!order };
}
