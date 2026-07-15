import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { memberNav, adminNav, site } from "@/lib/site";
import { MemberNav } from "@/components/MemberNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { signOut } from "@/app/login/actions";
import { Badge } from "@/components/ui";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireProfile();
  const isAdmin = profile.role === "admin";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row">
      {/* Sidebar */}
      <aside className="md:w-60 md:shrink-0">
        <div className="sticky top-6 space-y-4">
          <Link href="/" className="flex items-center gap-2 font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-fg">
              🎯
            </span>
            <span className="leading-tight">
              {site.clubName}
              <span className="block text-xs font-normal text-muted">
                Mitglieder
              </span>
            </span>
          </Link>

          <MemberNav
            items={memberNav}
            adminItems={isAdmin ? adminNav : undefined}
          />

          <div className="hidden border-t border-border pt-4 md:block">
            <div className="mb-2 flex items-center gap-2 px-3">
              <span className="text-sm font-medium">
                {profile.full_name || profile.email}
              </span>
              {isAdmin && <Badge tone="primary">Admin</Badge>}
            </div>
            <div className="flex items-center gap-2">
              <form action={signOut} className="flex-1">
                <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-border/40 hover:text-foreground">
                  Abmelden
                </button>
              </form>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
