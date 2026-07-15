import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getMemberEvents, getAllTeams } from "@/lib/member-queries";
import { siteUrl } from "@/lib/supabase/config";
import { EventCard } from "@/components/EventCard";
import { EventsCalendar } from "@/components/EventsCalendar";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { Einklappbar } from "@/components/Einklappbar";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Termine & Zusagen" };

export default async function MemberTerminePage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; monat?: string; team?: string }>;
}) {
  const { ansicht, monat, team } = await searchParams;
  const isCalendar = ansicht === "kalender";
  const profile = await requireProfile();
  const teams = await getAllTeams();

  const viewChip = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium ${
      active
        ? "bg-primary text-primary-fg"
        : "border border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Termine & Zusagen"
        subtitle="Sag zu oder ab – für Spieltage, Freundschaftsspiele und Training"
      />

      {/* Ansicht wählen */}
      <div className="flex gap-2">
        <Link href="/mitglieder/termine" className={viewChip(!isCalendar)}>
          📋 Liste
        </Link>
        <Link
          href="/mitglieder/termine?ansicht=kalender"
          className={viewChip(isCalendar)}
        >
          🗓️ Kalender
        </Link>
      </div>

      <Einklappbar
        id="termine-kalender-abo"
        title="📅 Kalender-Abo fürs Handy"
        defaultOpen={false}
      >
        <p className="text-sm text-muted">
          Einmal abonnieren – neue und geänderte Termine kommen dann
          automatisch in deinen Handy-Kalender. Stell dir unten zusammen, was
          drin sein soll (z. B. nur deine Mannschaft). Geburtstage und
          interne Termine bleiben immer außen vor. Klappt der Knopf nicht,
          kopiere die Adresse und trage sie in deiner Kalender-App als
          Abo-Kalender ein.
        </p>
        <div className="mt-3">
          <CalendarSubscribe
            icsUrl={`${siteUrl}/api/kalender`}
            teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          />
        </div>
      </Einklappbar>

      <Einklappbar
        id="termine-rahmenterminplan"
        title="📄 Rahmenterminplan 2026/27 & 2027/28"
        defaultOpen={false}
      >
        <p className="text-sm text-muted">
          Der offizielle Rahmenterminplan (Mittelfranken / BDV / DDV) als PDF
          – die Spielwochen stehen auch unten im Kalender.
        </p>
        <a
          href="/rahmenterminplan.pdf"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
        >
          PDF öffnen
        </a>
      </Einklappbar>

      {isCalendar ? (
        <EventsCalendar
          base="/mitglieder/termine?ansicht=kalender"
          monat={monat}
          team={team}
        />
      ) : (
        <ListView profileId={profile.id} />
      )}
    </div>
  );
}

async function ListView({ profileId }: { profileId: string }) {
  const [upcoming, past] = await Promise.all([
    getMemberEvents(profileId),
    getMemberEvents(profileId, { past: true, limit: 10 }),
  ]);

  return (
    <>
      <section>
        <h2 className="mb-3 text-lg font-bold">Anstehend</h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Keine anstehenden Termine" />
        ) : (
          <div className="space-y-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <Einklappbar
          id="termine-vergangen"
          title={`Vergangene Termine (${past.length})`}
          defaultOpen={false}
        >
          <div className="space-y-3 opacity-70">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </Einklappbar>
      )}
    </>
  );
}
