import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getMemberEvents } from "@/lib/member-queries";
import { siteUrl } from "@/lib/supabase/config";
import { EventCard } from "@/components/EventCard";
import { EventsCalendar } from "@/components/EventsCalendar";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { PageHeader, EmptyState, Card, CardBody } from "@/components/ui";

export const metadata: Metadata = { title: "Termine & Zusagen" };

export default async function MemberTerminePage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; monat?: string; team?: string }>;
}) {
  const { ansicht, monat, team } = await searchParams;
  const isCalendar = ansicht === "kalender";
  const profile = await requireProfile();

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

      <Card className="bg-primary/5">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="max-w-xl">
            <p className="font-semibold">📅 Kalender-Abo fürs Handy</p>
            <p className="text-sm text-muted">
              Einmal abonnieren – neue und geänderte Termine kommen dann
              automatisch in deinen Handy-Kalender. Enthalten sind alle
              öffentlichen Vereins- und Spieltermine sowie Turniere;
              Geburtstage und interne Termine bleiben außen vor. Klappt der
              Knopf nicht, kopiere die Adresse und trage sie in deiner
              Kalender-App als Abo-Kalender ein.
            </p>
          </div>
          <CalendarSubscribe icsUrl={`${siteUrl}/api/kalender`} />
        </CardBody>
      </Card>

      <Card className="bg-primary/5">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">📄 Rahmenterminplan 2026/27 & 2027/28</p>
            <p className="text-sm text-muted">
              Der offizielle Rahmenterminplan (Mittelfranken / BDV / DDV) als
              PDF – die Spielwochen stehen auch unten im Kalender.
            </p>
          </div>
          <a
            href="/rahmenterminplan.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
          >
            PDF öffnen
          </a>
        </CardBody>
      </Card>

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
        <section>
          <h2 className="mb-3 text-lg font-bold text-muted">Vergangen</h2>
          <div className="space-y-3 opacity-70">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
