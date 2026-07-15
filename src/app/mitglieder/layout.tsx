import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getManageableTeamIds } from "@/lib/member-queries";
import {
  memberNav,
  adminNav,
  editorNav,
  locabooNavItem,
  site,
} from "@/lib/site";
import { MemberNav } from "@/components/MemberNav";
import { MobileMenu } from "@/components/MobileMenu";
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
  const isEditor = profile.role === "editor";
  const navItems = isAdmin ? adminNav : isEditor ? editorNav : undefined;

  // Locaboo-Reiter (Raumbelegung des Hauptvereins) nur für
  // Kapitäne/Vize/Bearbeiter/Admins einblenden
  const zeigeLocaboo = (await getManageableTeamIds(profile)).size > 0;
  const hauptNav = zeigeLocaboo
    ? (() => {
        const kopie: (typeof memberNav)[number][] = [...memberNav];
        const i = kopie.findIndex((n) => n.href === "/mitglieder/nuliga");
        kopie.splice(i + 1, 0, locabooNavItem);
        return kopie;
      })()
    : memberNav;

  // Name + Abmelden + Theme: in der Desktop-Seitenleiste unten,
  // am Handy unten in der Menü-Schublade.
  const userBlock = (
    <>
      <div className="mb-2 flex items-center gap-2 px-3">
        <span className="text-sm font-medium">
          {profile.full_name || profile.email}
        </span>
        {isAdmin && <Badge tone="primary">Admin</Badge>}
        {isEditor && <Badge tone="primary">Bearbeiter</Badge>}
      </div>
      <div className="flex items-center gap-2">
        <form action={signOut} className="flex-1">
          <button className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted hover:bg-border/40 hover:text-foreground">
            Abmelden
          </button>
        </form>
        <ThemeToggle />
      </div>
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 md:flex-row md:gap-6 md:py-6">
      {/* Sidebar (Desktop) / Kopfzeile mit Menü-Knopf (Handy) */}
      <aside className="md:w-60 md:shrink-0">
        <div className="space-y-4 md:sticky md:top-6">
          <div className="flex items-center justify-between gap-2">
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
            <MobileMenu
              items={hauptNav}
              adminItems={navItems}
              footer={userBlock}
            />
          </div>

          <div className="hidden md:block">
            <MemberNav items={hauptNav} adminItems={navItems} />
          </div>

          <div className="hidden border-t border-border pt-4 md:block">
            {userBlock}
          </div>
        </div>
      </aside>

      {/* Content */}
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
