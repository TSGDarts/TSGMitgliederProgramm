"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Item = {
  href: string;
  label: string;
};

type DragInfo = {
  href: string;
  label: string;
  pointerId: number;
  startX: number;
  startY: number;
  aktiv: boolean;
  letztesZiel: string | null;
};

export function SortableNavList({
  items,
  move,
  moveTo,
}: {
  items: Item[];
  move: (href: string, delta: number) => void;
  moveTo: (href: string, zielHref: string) => void;
}) {
  const listeRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const autoScrollRef = useRef<{
    richtung: number;
    bereich: HTMLElement | null;
  } | null>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const [gezogen, setGezogen] = useState<string | null>(null);
  const [ziel, setZiel] = useState<string | null>(null);
  const [meldung, setMeldung] = useState("");

  function autoScrollStoppen() {
    autoScrollRef.current = null;
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
  }

  function autoScrollSchritt() {
    const scroll = autoScrollRef.current;
    if (!dragRef.current || !scroll) {
      autoScrollFrameRef.current = null;
      return;
    }
    if (scroll.bereich) scroll.bereich.scrollBy({ top: scroll.richtung * 8 });
    else window.scrollBy({ top: scroll.richtung * 8 });
    autoScrollFrameRef.current = requestAnimationFrame(autoScrollSchritt);
  }

  function autoScrollStarten(
    richtung: number,
    bereich: HTMLElement | null,
  ) {
    if (!richtung) {
      autoScrollStoppen();
      return;
    }
    autoScrollRef.current = { richtung, bereich };
    if (autoScrollFrameRef.current === null) {
      autoScrollFrameRef.current = requestAnimationFrame(autoScrollSchritt);
    }
  }

  useEffect(() => autoScrollStoppen, []);

  function beginnen(event: ReactPointerEvent<HTMLDivElement>, item: Item) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const element = event.target as HTMLElement;
    const amGriff = !!element.closest("[data-nav-drag-handle]");

    // Am PC darf die ganze Zeile gezogen werden. Auf Touch-Geräten bleibt die
    // Zeile scrollbar; dort startet nur der deutlich markierte Griff das Ziehen.
    if (event.pointerType !== "mouse" && !amGriff) return;
    if (element.closest("button") && !amGriff) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      href: item.href,
      label: item.label,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      aktiv: false,
      letztesZiel: null,
    };
  }

  function beimZiehen(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const strecke = Math.hypot(
      event.clientX - drag.startX,
      event.clientY - drag.startY,
    );
    if (!drag.aktiv) {
      if (strecke < 6) return;
      drag.aktiv = true;
      setGezogen(drag.href);
      setMeldung(`${drag.label} wird verschoben.`);
    }

    event.preventDefault();
    const darunter = document.elementFromPoint(event.clientX, event.clientY);
    const zielZeile = darunter?.closest<HTMLElement>("[data-nav-sort-id]");
    const zielHref = zielZeile?.dataset.navSortId ?? null;

    if (!zielHref || zielHref === drag.href) {
      drag.letztesZiel = null;
      setZiel(null);
    } else if (zielHref !== drag.letztesZiel) {
      drag.letztesZiel = zielHref;
      setZiel(zielHref);
      moveTo(drag.href, zielHref);
    }

    // Beim Ziehen am oberen/unteren Rand scrollt die Menüschublade mit.
    const scrollBereich = listeRef.current?.closest<HTMLElement>(
      "[data-nav-scroll-container]",
    );
    const rand = scrollBereich?.getBoundingClientRect() ?? {
      top: 0,
      bottom: window.innerHeight,
    };
    const richtung =
      event.clientY < rand.top + 52
        ? -1
        : event.clientY > rand.bottom - 52
          ? 1
          : 0;
    autoScrollStarten(richtung, scrollBereich ?? null);
  }

  function beenden(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    autoScrollStoppen();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.aktiv) {
      const position = items.findIndex((item) => item.href === drag.href) + 1;
      setMeldung(
        `${drag.label} abgelegt${position > 0 ? `, Position ${position} von ${items.length}` : ""}.`,
      );
    }
    setGezogen(null);
    setZiel(null);
  }

  return (
    <>
      <p className="px-3 pb-1 text-xs text-muted">
        Mit Maus oder Finger am Griff ziehen. Alternativ die Pfeile verwenden.
      </p>
      <div ref={listeRef} role="list" aria-label="Menüreihenfolge">
        {items.map((item, index) => {
          const wirdGezogen = gezogen === item.href;
          const istZiel = ziel === item.href;
          return (
            <div
              key={item.href}
              role="listitem"
              data-nav-sort-id={item.href}
              onPointerDown={(event) => beginnen(event, item)}
              onPointerMove={beimZiehen}
              onPointerUp={beenden}
              onPointerCancel={beenden}
              className={`mb-1 flex select-none items-center gap-2 rounded-lg border px-2 py-1.5 text-sm transition motion-reduce:transition-none ${
                wirdGezogen
                  ? "cursor-grabbing border-primary bg-primary/10 shadow-md"
                  : istZiel
                    ? "border-primary/60 bg-primary/5"
                    : "cursor-grab border-border bg-surface"
              }`}
            >
              <span
                data-nav-drag-handle
                aria-hidden
                title="Gedrückt halten und ziehen"
                className="grid h-9 w-9 shrink-0 touch-none cursor-grab place-items-center rounded-md text-lg text-muted hover:bg-border/50 hover:text-foreground active:cursor-grabbing"
              >
                <span aria-hidden>⠿</span>
              </span>
              <span className="min-w-0 flex-1 truncate font-medium">
                {item.label}
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => move(item.href, -1)}
                  disabled={index === 0}
                  className="grid h-8 w-8 place-items-center rounded border border-border hover:bg-border/40 disabled:opacity-30"
                  title="Nach oben"
                  aria-label={`${item.label} nach oben verschieben`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(item.href, 1)}
                  disabled={index === items.length - 1}
                  className="grid h-8 w-8 place-items-center rounded border border-border hover:bg-border/40 disabled:opacity-30"
                  title="Nach unten"
                  aria-label={`${item.label} nach unten verschieben`}
                >
                  ↓
                </button>
              </span>
            </div>
          );
        })}
      </div>
      <p className="sr-only" aria-live="polite">
        {meldung}
      </p>
    </>
  );
}
