import Link from "next/link";
import { getTeams, getPublicUpcomingEvents } from "@/lib/queries";
import { site } from "@/lib/site";
import { Card, CardBody, ButtonLink, Badge, EmptyState } from "@/components/ui";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

export default async function HomePage() {
  const [teams, events] = await Promise.all([
    getTeams(),
    getPublicUpcomingEvents(5),
  ]);

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="rounded-2xl border border-border bg-gradient-to-br from-primary/10 to-transparent p-8 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {site.tagline}
        </p>
        <h1 className="mt-2 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
          Willkommen bei der Dart-Abteilung der {site.clubName}
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Alle Infos zu unseren Mannschaften, dem gemeinsamen Terminkalender und
          den nächsten Spieltagen. Mitglieder verwalten hier Zu- und Absagen,
          Kader und Fragen.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/mannschaften">Unsere Mannschaften</ButtonLink>
          <ButtonLink href="/mitglieder" variant="secondary">
            Zum Mitglieder-Bereich
          </ButtonLink>
        </div>
      </section>

      {/* Nächste Termine */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-bold">Nächste Termine</h2>
          <Link href="/termine" className="text-sm text-primary hover:underline">
            Alle Termine →
          </Link>
        </div>
        {events.length === 0 ? (
          <EmptyState
            title="Noch keine Termine eingetragen"
            hint="Sobald der Terminkalender gepflegt ist, erscheinen hier die nächsten Spieltage."
          />
        ) : (
          <div className="space-y-3">
            {events.map((ev) => (
              <Card key={ev.id}>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge tone="primary">{EVENT_TYPE_LABELS[ev.type]}</Badge>
                      <span className="font-medium">{ev.title}</span>
                    </div>
                    {ev.location && (
                      <p className="mt-1 text-sm text-muted">📍 {ev.location}</p>
                    )}
                  </div>
                  <span className="text-sm text-muted">
                    {formatDateTime(ev.starts_at)}
                  </span>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Mannschaften */}
      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-xl font-bold">Mannschaften</h2>
          <Link
            href="/mannschaften"
            className="text-sm text-primary hover:underline"
          >
            Übersicht →
          </Link>
        </div>
        {teams.length === 0 ? (
          <EmptyState
            title="Noch keine Mannschaften angelegt"
            hint="Die Mannschaften werden im Verwaltungsbereich angelegt."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <Link key={team.id} href={`/mannschaften/${team.slug}`}>
                <Card className="h-full transition hover:border-primary">
                  <CardBody>
                    <h3 className="font-semibold">{team.name}</h3>
                    {team.league && (
                      <p className="mt-1 text-sm text-muted">{team.league}</p>
                    )}
                    {team.description && (
                      <p className="mt-2 line-clamp-2 text-sm text-muted">
                        {team.description}
                      </p>
                    )}
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
