import Link from "next/link";
import { publicNav, site } from "@/lib/site";
import { ButtonLink } from "@/components/ui";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-fg">
            🎯
          </span>
          <span className="leading-tight">
            {site.clubName}
            <span className="block text-xs font-normal text-muted">
              {site.section}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {publicNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-border/40 hover:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <ButtonLink href="/mitglieder" variant="primary" className="shrink-0">
          Mitglieder-Login
        </ButtonLink>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-4 py-2 sm:hidden">
        {publicNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-border/40"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
