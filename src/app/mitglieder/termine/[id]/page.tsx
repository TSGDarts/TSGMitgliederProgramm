import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import {
  getEvent,
  getEventParticipants,
  getTeamsMap,
} from "@/lib/member-queries";
import { RsvpButtons } from "@/components/RsvpButtons";
import { AddressLine } from "@/components/AddressLine";
import { PageHeader, Card, CardBody, Badge } from "@/components/ui";
import {
  EVENT_TYPE_LABELS,
  RSVP_LABELS,
  type RsvpStatus,
} from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";

const groups: { key: RsvpStatus | "open"; label: string; tone: string }[] = [
  { key: "yes", label: "Zusagen", tone: "text-ok" },
  { key: "maybe", label: "Vielleicht", tone: "text-warn" },
  { key: "no", label: "Absagen", tone: "text-danger" },
  { key: "open", label: "Keine Rückmeldung", tone: "text-muted" },
];

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const event = await getEvent(id);
  if (!event) notFound();

  const [participants, teams] = await Promise.all([
    getEventParticipants(event),
    getTeamsMap(),
  ]);

  const myStatus =
    participants.find((p) => p.profile.id === profile.id)?.status ?? null;
  const teamName = event.team_id ? teams.get(event.team_id)?.name : null;

  const byStatus = (key: RsvpStatus | "open") =>
    participants.filter((p) =>
      key === "open" ? p.status === null : p.status === key,
    );

  return (
    <div className="space-y-6">
      <Link
        href="/mitglieder/termine"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Termine
      </Link>

      <PageHeader
        title={event.title}
        subtitle={
          event.time_tbd
            ? `${formatDate(event.starts_at)} – ⏳ genaue Uhrzeit folgt`
            : formatDateTime(event.starts_at)
        }
      />

      {event.location && (
        <AddressLine address={event.location} className="text-sm" />
      )}

      {(event.meet_home_time || event.meet_venue_time) && (
        <p className="text-sm text-muted">
          {event.meet_home_time && (
            <>🚌 Treffpunkt bei der TSG: {event.meet_home_time} Uhr</>
          )}
          {event.meet_home_time && event.meet_venue_time && " · "}
          {event.meet_venue_time && (
            <>🤝 Treffpunkt vor Ort: {event.meet_venue_time} Uhr</>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="primary">{EVENT_TYPE_LABELS[event.type]}</Badge>
        <Badge>{teamName ?? "Gesamter Verein"}</Badge>
        {event.source === "nuliga" && <Badge>aus nuLiga</Badge>}
        {event.home_away === "heim" && <Badge tone="ok">🏠 Heim</Badge>}
        {event.home_away === "auswaerts" && (
          <Badge tone="warn">🚗 Auswärts</Badge>
        )}
        {event.meeting_url && (
          <a
            href={event.meeting_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
          >
            🎦 Online teilnehmen
          </a>
        )}
      </div>

      {event.description && (
        <Card>
          <CardBody>
            <p className="whitespace-pre-line text-muted">
              {event.description}
            </p>
          </CardBody>
        </Card>
      )}

      <Card className="bg-primary/5">
        <CardBody className="space-y-2">
          <p className="text-sm font-medium">Deine Rückmeldung</p>
          <RsvpButtons
            eventId={event.id}
            current={myStatus}
            currentComment={
              participants.find((p) => p.profile.id === profile.id)?.comment ??
              ""
            }
          />
        </CardBody>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2">
        {groups.map((g) => {
          const list = byStatus(g.key);
          return (
            <Card key={g.key}>
              <CardBody>
                <h3 className={`mb-2 font-semibold ${g.tone}`}>
                  {g.label}{" "}
                  <span className="text-sm font-normal text-muted">
                    ({list.length})
                  </span>
                </h3>
                {list.length === 0 ? (
                  <p className="text-sm text-muted">—</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {list.map((p) => (
                      <li
                        key={p.profile.id}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span>{p.profile.full_name || p.profile.email}</span>
                        {p.isCaptain && <Badge tone="primary">C</Badge>}
                        {p.isViceCaptain && <Badge>VC</Badge>}
                        {p.isDefault && (
                          <span
                            className="text-xs text-muted"
                            title="Team-Vorbelegung – noch keine eigene Antwort"
                          >
                            (Standard)
                          </span>
                        )}
                        {g.key === "no" && p.comment && (
                          <span className="text-xs italic text-muted">
                            – {p.comment}
                          </span>
                        )}
                        {g.key !== "open" &&
                          p.status &&
                          p.profile.id === profile.id && (
                            <span className="text-xs text-muted">
                              ({RSVP_LABELS[p.status]})
                            </span>
                          )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          );
        })}
      </section>
    </div>
  );
}
