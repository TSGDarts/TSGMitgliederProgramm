import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getMemberEvents } from "@/lib/member-queries";
import { EventCard } from "@/components/EventCard";
import { PageHeader, EmptyState, Card, CardBody } from "@/components/ui";

export const metadata: Metadata = { title: "Termine & Zusagen" };

export default async function MemberTerminePage() {
  const profile = await requireProfile();
  const [upcoming, past] = await Promise.all([
    getMemberEvents(profile.id),
    getMemberEvents(profile.id, { past: true, limit: 10 }),
  ]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Termine & Zusagen"
        subtitle="Sag zu oder ab – für Spieltage, Freundschaftsspiele und Training"
      />

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
    </div>
  );
}
