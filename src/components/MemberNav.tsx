"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type Item = { href: string; label: string; external?: boolean };

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

  const link = (item: Item) =>
    item.external ? (
      <a
        key={item.href}
        href={item.href}
        target="_blank"
        rel="noreferrer"
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
      {items.map(link)}
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
