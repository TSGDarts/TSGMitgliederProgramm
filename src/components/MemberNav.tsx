"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string };

function isActive(pathname: string, href: string) {
  if (href === "/mitglieder") return pathname === "/mitglieder";
  return pathname === href || pathname.startsWith(href + "/");
}

export function MemberNav({
  items,
  adminItems,
}: {
  items: Item[];
  adminItems?: Item[];
}) {
  const pathname = usePathname();

  const link = (item: Item) => (
    <Link
      key={item.href}
      href={item.href}
      className={`block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
        isActive(pathname, item.href)
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
