import Link from "next/link";
import { Card, CardBody, Badge } from "@/components/ui";
import { RsvpButtons } from "@/components/RsvpButtons";
import { AddressLine } from "@/components/AddressLine";
import {
  EVENT_TYPE_LABELS,
  isCompSpiegel,
  brauchtRueckmeldung,
} from "@/lib/types";
import type {
  EventWithStatus,
  MatchAttendanceSummary,
} from "@/lib/member-queries";
import { formatDate, formatTime, formatUntil } from "@/lib/format";

function attendanceTone(
  attendance: MatchAttendanceSummary,
): "ok" | "warn" | "danger" {
  if (attendance.yes < attendance.required) return "danger";
  if (attendance.yes === attendance.required) return "warn";
  return "ok";
}

function attendanceLabel(attendance: MatchAttendanceSummary) {
  const parts = [`${attendance.yes}/${attendance.required} Zusagen`];
  if (attendance.yes === attendance.required) parts.push("knapp");
  if (attendance.open > 0) parts.push(`${attendance.open} offen`);
  return parts.join(" · ");
}

export function EventCard({
  event,
  trainerNames,
  contactNames,
  attendance,
}: {
  event: EventWithStatus;
  trainerNames?: string[];
  contactNames?: string[];
  attendance?: MatchAttendanceSummary;
}) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">{EVENT_TYPE_LABELS[event.type]}</Badge>
              {event.teamName ? (
                <Badge>{event.teamName}</Badge>
              ) : (
                <Badge>Gesamter Verein</Badge>
              )}
              {event.source === "nuliga" && <Badge tone="neutral">nuLiga</Badge>}
              {event.home_away === "heim" && <Badge tone="ok">🏠 Heim</Badge>}
              {event.home_away === "auswaerts" && (
                <Badge tone="warn">🚗 Auswärts</Badge>
              )}
            </div>
            <Link
              href={`/mitglieder/termine/${event.id}`}
              className="mt-1 block font-semibold hover:text-primary"
            >
              {event.title}
            </Link>
            <p className="mt-0.5 text-sm text-muted">
              {formatDate(event.starts_at)} ·{" "}
              {event.time_tbd ? (
                <span className="font-medium text-warn">
                  ⏳ Genaue Uhrzeit folgt
                </span>
              ) : (
                <>Start {formatTime(event.starts_at)} Uhr</>
              )}
              {event.ends_at && (
                <> · {formatUntil(event.starts_at, event.ends_at)}</>
              )}
            </p>
            {trainerNames && trainerNames.length > 0 && (
              <p className="mt-0.5 text-sm text-muted">
                💪 Trainer: {trainerNames.join(", ")}
              </p>
            )}
            {contactNames && contactNames.length > 0 && (
              <p className="mt-0.5 text-sm text-muted">
                👤 Ansprechpartner: {contactNames.join(", ")}
              </p>
            )}
            {(event.meet_home_time || event.meet_venue_time) && (
              <p className="mt-0.5 text-sm text-muted">
                {event.meet_home_time && (
                  <>🚌 Treffpunkt TSG {event.meet_home_time} Uhr</>
                )}
                {event.meet_home_time && event.meet_venue_time && " · "}
                {event.meet_venue_time && (
                  <>🤝 Treffpunkt vor Ort {event.meet_venue_time} Uhr</>
                )}
              </p>
            )}
            {event.location && (
              <AddressLine address={event.location} className="mt-0.5 text-sm" />
            )}
          </div>
          {attendance && (
            <Badge tone={attendanceTone(attendance)}>
              {attendance.yes <= attendance.required ? "⚠️ " : "👥 "}
              {attendanceLabel(attendance)}
            </Badge>
          )}
        </div>

        {/* Gespiegelte Competition-Abende und „nur zur Info"-Termine sind
            reine Anzeige – ohne Zu-/Absage */}
        {brauchtRueckmeldung(event) ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RsvpButtons
              eventId={event.id}
              current={event.myStatus}
              currentComment={event.myComment}
            />
            <span className="flex items-center gap-3">
              {event.meeting_url && (
                <a
                  href={event.meeting_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  🎦 Online-Link
                </a>
              )}
              <Link
                href={`/mitglieder/termine/${event.id}`}
                className="text-sm text-primary hover:underline"
              >
                Wer kommt? →
              </Link>
            </span>
          </div>
        ) : event.info_only && !isCompSpiegel(event) ? (
          <p className="text-sm text-muted">
            📢 Nur zur Info – keine Zu-/Absage nötig.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
