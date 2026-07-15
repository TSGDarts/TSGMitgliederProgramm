"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Eingebettete PDF-Ansicht mit Verschieben & Zoomen (wie in der
 * Competition-App): Das iframe bekommt pointer-events:none und wird so hoch
 * gemacht, dass ALLE Seiten hineinpassen – dann scrollt nicht der PDF-Viewer
 * intern, sondern unser Rahmen. Ziehen verschiebt, −/+ oder zwei Finger
 * zoomen. Geladen wird das PDF erst, wenn der Bereich sichtbar wird.
 */
export function PdfPan({
  src,
  titel,
  seiten = 2,
  aspekt = 1.42, // A4 hoch
}: {
  src: string;
  titel: string;
  seiten?: number;
  aspekt?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const anzeigeRef = useRef<HTMLSpanElement>(null);
  const zoomFn = useRef<((delta: number, fix?: number) => void) | null>(null);
  const [aktiv, setAktiv] = useState(false);

  // PDF erst laden, wenn der Bereich aufgeklappt/sichtbar ist
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setAktiv(true);
        io.disconnect();
      }
    });
    io.observe(wrap);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!aktiv) return;
    const wrap = wrapRef.current;
    const frame = frameRef.current;
    if (!wrap || !frame) return;

    let zoom = 100;
    const groesse = () => {
      const b = Math.max(240, Math.round((wrap.clientWidth * zoom) / 100));
      frame.style.width = `${b}px`;
      // +6 % Luft pro Seite für die Seitenabstände des PDF-Viewers
      frame.style.height = `${Math.round(b * aspekt * seiten * 1.06 + 40)}px`;
      if (anzeigeRef.current) anzeigeRef.current.textContent = `${zoom} %`;
      // FitH: PDF passt sich der iframe-Breite an („z“ erzwingt das Neu-Anwenden)
      frame.src = `${src}#toolbar=0&navpanes=0&view=FitH&z=${zoom}`;
    };
    const zoomen = (delta: number, fix?: number) => {
      const neu = Math.max(
        50,
        Math.min(400, Math.round(fix != null ? fix : zoom + delta)),
      );
      if (neu === zoom) return;
      const rx = wrap.scrollWidth
        ? (wrap.scrollLeft + wrap.clientWidth / 2) / wrap.scrollWidth
        : 0;
      const ry = wrap.scrollHeight
        ? (wrap.scrollTop + wrap.clientHeight / 2) / wrap.scrollHeight
        : 0;
      zoom = neu;
      groesse();
      wrap.scrollLeft = rx * wrap.scrollWidth - wrap.clientWidth / 2;
      wrap.scrollTop = ry * wrap.scrollHeight - wrap.clientHeight / 2;
    };
    zoomFn.current = zoomen;

    // Ziehen (ein Finger/Maus) + Kneifzoom (zwei Finger)
    const zeiger = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    const runter = (e: PointerEvent) => {
      try {
        wrap.setPointerCapture(e.pointerId);
      } catch {}
      zeiger.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (zeiger.size === 2) {
        const p = [...zeiger.values()];
        pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
      wrap.style.cursor = "grabbing";
      e.preventDefault();
    };
    const bewegen = (e: PointerEvent) => {
      const p = zeiger.get(e.pointerId);
      if (!p) return;
      if (zeiger.size === 1) {
        wrap.scrollLeft -= e.clientX - p.x;
        wrap.scrollTop -= e.clientY - p.y;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (zeiger.size === 2 && pinch) {
        const z = [...zeiger.values()];
        const d = Math.hypot(z[0].x - z[1].x, z[0].y - z[1].y);
        if (Math.abs(d - pinch) > 12) {
          zoomen(0, (zoom * d) / pinch);
          pinch = d;
        }
      }
    };
    const los = (e: PointerEvent) => {
      zeiger.delete(e.pointerId);
      pinch = 0;
      if (!zeiger.size) wrap.style.cursor = "grab";
    };
    const rad = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        zoomen(e.deltaY < 0 ? 15 : -15);
      }
    };
    wrap.addEventListener("pointerdown", runter);
    wrap.addEventListener("pointermove", bewegen);
    wrap.addEventListener("pointerup", los);
    wrap.addEventListener("pointercancel", los);
    wrap.addEventListener("wheel", rad, { passive: false });
    groesse();

    return () => {
      wrap.removeEventListener("pointerdown", runter);
      wrap.removeEventListener("pointermove", bewegen);
      wrap.removeEventListener("pointerup", los);
      wrap.removeEventListener("pointercancel", los);
      wrap.removeEventListener("wheel", rad);
      zoomFn.current = null;
    };
  }, [aktiv, src, seiten, aspekt]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
        >
          ↗ PDF in neuem Tab öffnen
        </a>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => zoomFn.current?.(-15)}
            title="kleiner"
            className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-border/40"
          >
            −
          </button>
          <span
            ref={anzeigeRef}
            className="min-w-12 text-center text-xs text-muted"
          >
            100 %
          </span>
          <button
            type="button"
            onClick={() => zoomFn.current?.(15)}
            title="größer"
            className="rounded-lg border border-border px-2.5 py-1 text-sm hover:bg-border/40"
          >
            +
          </button>
        </span>
      </div>
      <div
        ref={wrapRef}
        className="h-[70vh] cursor-grab touch-none select-none overflow-auto overscroll-contain rounded-lg border border-border bg-border/30"
      >
        <iframe
          ref={frameRef}
          title={titel}
          className="pointer-events-none block border-0 bg-white"
        />
      </div>
      <p className="text-center text-xs text-muted">
        🖐 Andrücken und ziehen verschiebt den Ausschnitt · Zoom über − / +,
        Strg + Mausrad oder zwei Finger. Zeigt das Handy die Vorschau nicht
        an, einfach oben auf „PDF in neuem Tab öffnen“ tippen.
      </p>
    </div>
  );
}
