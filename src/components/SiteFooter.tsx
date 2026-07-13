import Link from "next/link";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {site.fullName}
        </p>
        <div className="flex gap-4">
          <Link href="/kontakt" className="hover:text-foreground">
            Kontakt
          </Link>
          <Link href="/mitglieder" className="hover:text-foreground">
            Mitglieder-Login
          </Link>
        </div>
      </div>
    </footer>
  );
}
