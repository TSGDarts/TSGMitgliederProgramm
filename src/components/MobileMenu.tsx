"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useNavOrder } from "./navOrder";

type Item = { href: string; label: string; external?: boolean };

/**
 * Handy-Navigation: ☰-Knopf öffnet eine seitliche Schublade mit allen
 * Menüpunkten (statt der alten horizontalen Wischleiste). Ab md unsichtbar –
 * dort übernimmt die klassische Seitenleiste.
 */
export function MobileMenu({
  items,
  adminItems,
  footer,
}: {
  items: Item[];
  adminItems?: Item[];
  footer?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [anpassen, setAnpassen] = useState(false);
  const pathname = usePathname();
  const search = useSearchParams();
  const suchtext = search.toString();
  const { sorted, move, reset, angepasst } = useNavOrder(items);

  // Beim Seitenwechsel automatisch schließen (auch bei ?-Wechsel)
  useEffect(() => {
    setOpen(false);
  }, [pathname, suchtext]);

  // Hintergrund nicht mitscrollen lassen, solange das Menü offen ist
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Aktiv-Erkennung – auch für Einträge mit ?-Parametern (z. B. Ergebnisse)
  const isActive = (href: string) => {
    const [pfad, query] = href.split("?");
    if (query) {
      if (pathname !== pfad) return false;
      for (const [k, v] of new URLSearchParams(query)) {
        if (search.get(k) !== v) return false;
      }
      return true;
    }
    if (pfad === "/mitglieder") {
      return pathname === "/mitglieder" && !search.get("ansicht");
    }
    return pathname === pfad || pathname.startsWith(pfad + "/");
  };

  const link = (item: Item) =>
    item.external ? (
      <a
        key={item.href}
        href={item.href}
        target="_blank"
        rel="noreferrer"
        onClick={() => setOpen(false)}
        className="block rounded-lg px-3 py-2.5 text-sm font-medium text-muted hover:bg-border/40 hover:text-foreground"
      >
        {item.label} ↗
      </a>
    ) : (
      <Link
        key={item.href}
        href={item.href}
        onClick={() => setOpen(false)}
        className={`block rounded-lg px-3 py-2.5 text-sm font-medium ${
          isActive(item.href)
            ? "bg-primary text-primary-fg"
            : "text-muted hover:bg-border/40 hover:text-foreground"
        }`}
      >
        {item.label}
      </Link>
    );

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Menü öffnen"
        className="rounded-lg border border-border px-3 py-2 text-lg leading-none"
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 z-50">
          {/* Abdunkelung – Tippen schließt */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-surface p-4 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="px-3 font-bold">Menü</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Menü schließen"
                className="rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                ✕
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {anpassen
                ? sorted.map((item, index) => (
                    <div
                      key={item.href}
                      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">{item.label}</span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => move(item.href, -1)}
                          disabled={index === 0}
                          className="rounded border border-border px-2 py-0.5 hover:bg-border/40 disabled:opacity-30"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(item.href, 1)}
                          disabled={index === sorted.length - 1}
                          className="rounded border border-border px-2 py-0.5 hover:bg-border/40 disabled:opacity-30"
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                  ))
                : sorted.map(link)}
              <div className="flex items-center gap-3 px-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAnpassen(!anpassen)}
                  className="text-xs text-muted hover:text-foreground"
                >
                  {anpassen ? "✓ Fertig" : "⚙️ Menü anpassen"}
                </button>
                {anpassen && angepasst && (
                  <button
                    type="button"
                    onClick={reset}
                    className="text-xs text-muted hover:text-foreground"
                  >
                    Standard
                  </button>
                )}
              </div>
              {adminItems && adminItems.length > 0 && (
                <>
                  <div className="mb-1 mt-3 px-3 text-xs font-semibold uppercase tracking-wide text-muted">
                    Verwaltung
                  </div>
                  {adminItems.map(link)}
                </>
              )}
            </nav>
            {footer && (
              <div className="mt-4 border-t border-border pt-4">{footer}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
