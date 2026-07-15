"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Zoom-Rahmen für den Monatskalender: −/+ Knöpfe und Kneifzoom mit zwei
 * Fingern. Herausgezoomt passt der ganze Monat aufs Handy, hereingezoomt
 * wird alles größer (seitliches Wischen bleibt wie gehabt). Der Zoom wird
 * pro Gerät gemerkt.
 */
export function KalenderZoom({ children }: { children: React.ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(1);
  zoomRef.current = zoom;

  // Gemerkten Zoom laden
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("kalender-zoom"));
      if (Number.isFinite(saved) && saved >= 0.5 && saved <= 2) {
        setZoom(saved);
      }
    } catch {}
  }, []);

  function setzeZoom(wert: number) {
    const neu = Math.round(Math.max(0.5, Math.min(2, wert)) * 100) / 100;
    setZoom(neu);
    try {
      localStorage.setItem("kalender-zoom", String(neu));
    } catch {}
  }

  // Kneifzoom (zwei Finger) – ein Finger bleibt normales Wischen/Tippen
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let pinch = 0;
    let startZoom = 1;
    const abstand = (t: TouchList) =>
      Math.hypot(
        t[0].clientX - t[1].clientX,
        t[0].clientY - t[1].clientY,
      );
    const start = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = abstand(e.touches);
        startZoom = zoomRef.current;
        e.preventDefault();
      }
    };
    const move = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinch > 0) {
        e.preventDefault();
        setzeZoom(startZoom * (abstand(e.touches) / pinch));
      }
    };
    const ende = () => {
      pinch = 0;
    };
    wrap.addEventListener("touchstart", start, { passive: false });
    wrap.addEventListener("touchmove", move, { passive: false });
    wrap.addEventListener("touchend", ende);
    wrap.addEventListener("touchcancel", ende);
    return () => {
      wrap.removeEventListener("touchstart", start);
      wrap.removeEventListener("touchmove", move);
      wrap.removeEventListener("touchend", ende);
      wrap.removeEventListener("touchcancel", ende);
    };
  }, []);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-end gap-1">
        <button
          type="button"
          onClick={() => setzeZoom(zoom - 0.1)}
          title="kleiner"
          className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-border/40"
        >
          −
        </button>
        <span className="min-w-12 text-center text-xs text-muted">
          {Math.round(zoom * 100)} %
        </span>
        <button
          type="button"
          onClick={() => setzeZoom(zoom + 0.1)}
          title="größer"
          className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-border/40"
        >
          +
        </button>
      </div>
      <div ref={wrapRef} className="overflow-x-auto">
        {/* CSS-zoom skaliert samt Layout – kein Leerraum wie bei transform */}
        <div style={{ zoom }}>{children}</div>
      </div>
    </div>
  );
}
