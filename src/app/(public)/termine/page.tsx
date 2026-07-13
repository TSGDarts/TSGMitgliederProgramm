import type { Metadata } from "next";
import { getPublicUpcomingEvents } from "@/lib/queries";
import {
  PageHeader,
  Card,
  CardBody,
  EmptyState,
  Badge,
} from "@/components/ui";
import { EVENT_TYPE_LABELS } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Termine" };

export default async function TerminePage() {
  const events = await getPublicUpcomingEvents(100);

  return (
    <div>
      <PageHeader
        title="Terminkalender"
        subtitle="Gemeinsamer Rahmenkalender – kommende Termine"
      />
      <Card className="mb-6 bg-primary/5">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-medium">📄 Rahmenterminplan 2026/27 & 2027/28</p>
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
      {events.length === 0 ? (
        <EmptyState
          title="Noch keine Termine eingetragen"
          hint="Sobald der Kalender gepflegt ist, erscheinen hier die nächsten Spieltage und Veranstaltungen."
        />
      ) : (
        <div className="space-y-3">
          {events.map((ev) => (
            <Card key={ev.id}>
              <CardBody className="flex flex-wrap items-center gap-4">
                <div className="w-16 shrink-0 text-center">
                  <div className="text-2xl font-bold text-primary">
                    {new Date(ev.starts_at).getDate()}
                  </div>
                  <div className="text-xs uppercase text-muted">
                    {new Intl.DateTimeFormat("de-DE", { month: "short" }).format(
                      new Date(ev.starts_at),
                    )}
                  </div>
                </div>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="primary">{EVENT_TYPE_LABELS[ev.type]}</Badge>
                    <span className="font-medium">{ev.title}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {formatDate(ev.starts_at)} · {formatTime(ev.starts_at)} Uhr
                    {ev.location ? ` · 📍 ${ev.location}` : ""}
                  </p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
