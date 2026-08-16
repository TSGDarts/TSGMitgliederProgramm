"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useNavOrder } from "./navOrder";
import { SortableNavList } from "./SortableNavList";

type Item = {
  href: string;
  label: string;
  external?: boolean;
  externalHref?: string;
};

/** Aktiv-Erkennung – auch für Einträge mit ?-Parametern (z. B. Ergebnisse). */
function istAktiv(
  pathname: string,
  search: URLSearchParams,
  href: string,
): boolean {
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
}

export function MemberNav({
  items,
  adminItems,
}: {
  items: Item[];
  adminItems?: Item[];
}) {
  const pathname = usePathname();
  const search = useSearchParams();
  const { sorted, move, moveTo, reset, angepasst } = useNavOrder(items);
  const [anpassen, setAnpassen] = useState(false);

  const link = (item: Item) =>
    item.external ? (
      <a
        key={item.href}
        href={item.externalHref ?? item.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${item.label} – öffnet in neuem Tab`}
        className="block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-border/40 hover:text-foreground"
      >
        {item.label} ↗
      </a>
    ) : (
      <Link
        key={item.href}
        href={item.href}
        className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
          istAktiv(pathname, search, item.href)
            ? "bg-primary text-primary-fg"
            : "text-muted hover:bg-border/40 hover:text-foreground"
        }`}
      >
        {item.label}
      </Link>
    );

  return (
    <nav className="flex flex-col gap-1">
      {anpassen ? (
        <SortableNavList items={sorted} move={move} moveTo={moveTo} />
      ) : (
        sorted.map(link)
      )}

      <div className="flex items-center gap-2 px-3 pt-1">
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
          <div className="my-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted">
            Verwaltung
          </div>
          {adminItems.map(link)}
        </>
      )}
    </nav>
  );
}
