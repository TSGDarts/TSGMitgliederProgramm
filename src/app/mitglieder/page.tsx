import { requireProfile } from "@/lib/auth";
import { getMemberEvents } from "@/lib/member-queries";
import { EventCard } from "@/components/EventCard";
import { PageHeader, EmptyState, Card, CardBody } from "@/components/ui";
import Link from "next/link";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const events = await getMemberEvents(profile.id, { limit: 5 });

  const offen = events.filter((e) => e.myStatus === null).length;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hallo ${profile.full_name?.split(" ")[0] || ""}!`.trim()}
        subtitle="Deine nächsten Termine und offenen Rückmeldungen"
      />

      {offen > 0 && (
        <Card className="border-warn/40 bg-warn/5">
          <CardBody className="text-sm">
            Du hast noch{" "}
            <strong>
              {offen} offene Rückmeldung{offen === 1 ? "" : "en"}
            </strong>
            . Bitte sag zu oder ab.
          </CardBody>
        </Card>
      )}

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-lg font-bold">Nächste Termine</h2>
          <Link
            href="/mitglieder/termine"
            className="text-sm text-primary hover:underline"
          >
            Alle Termine →
          </Link>
        </div>
        {events.length === 0 ? (
          <EmptyState
            title="Keine anstehenden Termine"
            hint="Sobald Termine eingetragen sind, erscheinen sie hier mit Zu-/Absage."
          />
        ) : (
          <div className="space-y-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
