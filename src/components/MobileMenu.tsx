"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

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
  const pathname = usePathname();

  // Beim Seitenwechsel automatisch schließen
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Hintergrund nicht mitscrollen lassen, solange das Menü offen ist
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/mitglieder"
      ? pathname === "/mitglieder"
      : pathname === href || pathname.startsWith(href + "/");

  const link = (item: Item) => (
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
              {items.map(link)}
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
