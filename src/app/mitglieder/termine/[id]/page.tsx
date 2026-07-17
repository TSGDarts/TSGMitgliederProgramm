import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getEvent,
  getEventParticipants,
  getTeamsMap,
  getManageableTeamIds,
  getTeamRoster,
} from "@/lib/member-queries";
import { getGegnerVorlage, getSpielModi } from "@/lib/settings";
import { RsvpButtons } from "@/components/RsvpButtons";
import { AddressLine } from "@/components/AddressLine";
import { CarpoolSection, type CarpoolFahrer } from "@/components/CarpoolSection";
import { HelferSection, type HelferEintrag } from "@/components/HelferSection";
import { LineupSection } from "@/components/LineupSection";
import { GegnerNachricht } from "@/components/GegnerNachricht";
import { MatchUrlForm } from "@/components/MatchUrlForm";
import { ErgebnisMelden } from "@/components/ErgebnisMelden";
import type { LineupEintrag } from "@/app/mitglieder/termine/spieltag-actions";
import { PageHeader, Card, CardBody, Badge } from "@/components/ui";
import {
  EVENT_TYPE_LABELS,
  RSVP_LABELS,
  isCompSpiegel,
  type RsvpStatus,
} from "@/lib/types";
import {
  formatDate,
  formatDateTime,
  formatTime,
  formatUntil,
} from "@/lib/format";

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

  const spiegel = isCompSpiegel(event);
  const istSpiel =
    !!event.team_id && ["match", "pokal", "friendly"].includes(event.type);
  const istHeimspiel = istSpiel && event.home_away === "heim" && !spiegel;

  const supabase = await createClient();
  const [participants, teams, manageable] = await Promise.all([
    getEventParticipants(event),
    getTeamsMap(),
    event.team_id
      ? getManageableTeamIds(profile)
      : Promise.resolve(new Set<string>()),
  ]);
  const canManage = event.team_id ? manageable.has(event.team_id) : false;

  const myStatus =
    participants.find((p) => p.profile.id === profile.id)?.status ?? null;
  const teamName = event.team_id ? teams.get(event.team_id)?.name : null;

  // Alle unabhängigen Detail-Abfragen PARALLEL laden (statt nacheinander –
  // das macht die Seite deutlich schneller)
  const [
    trainerRes,
    kontaktRes,
    lineupRes,
    rosterRoh,
    modiRes,
    carpoolRes,
    helferRes,
    oppRes,
    vorlageRes,
  ] = await Promise.all([
    event.trainer_ids?.length
      ? supabase
          .from("profiles")
          .select("full_name")
          .in("id", event.trainer_ids)
          .order("full_name")
      : Promise.resolve({ data: null }),
    event.contact_ids?.length
      ? supabase
          .from("profiles")
          .select("full_name, phone")
          .in("id", event.contact_ids)
          .order("full_name")
      : Promise.resolve({ data: null }),
    istSpiel
      ? supabase
          .from("event_lineups")
          .select("entries, released")
          .eq("event_id", event.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    istSpiel && canManage ? getTeamRoster(event.team_id!) : Promise.resolve([]),
    istSpiel ? getSpielModi() : Promise.resolve(null),
    !spiegel
      ? supabase
          .from("event_carpool")
          .select("profile_id, role, seats, profiles(full_name)")
          .eq("event_id", event.id)
      : Promise.resolve({ data: null }),
    istHeimspiel
      ? supabase
          .from("event_helpers")
          .select("profile_id, aufgabe, profiles(full_name)")
          .eq("event_id", event.id)
      : Promise.resolve({ data: null }),
    istSpiel && canManage && event.home_away === "heim" && event.opponent_id
      ? supabase
          .from("opponents")
          .select("contact_name")
          .eq("id", event.opponent_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    istSpiel && canManage && event.home_away === "heim"
      ? getGegnerVorlage()
      : Promise.resolve(null),
  ]);

  // Anwesende Trainer (bei Trainings)
  const trainerNames = (trainerRes.data ?? []).map(
    (t) => t.full_name as string,
  );

  // Ansprechpartner (mit Handynummer – nur für Mitglieder sichtbar)
  const kontakte = (kontaktRes.data ?? []) as {
    full_name: string;
    phone: string | null;
  }[];

  // Aufstellung (nur bei Mannschafts-Spielen)
  let lineupEntries: LineupEintrag[] = [];
  let lineupReleased = false;
  if (lineupRes.data) {
    lineupEntries = (lineupRes.data.entries as LineupEintrag[]) ?? [];
    lineupReleased = !!lineupRes.data.released;
  }
  const roster: { id: string; name: string }[] = rosterRoh.map((m) => ({
    id: m.profile_id,
    name: m.profile.full_name || m.profile.email || "?",
  }));

  // Spielmodus (vom Admin gepflegt) – bei Punkt- und Pokalspielen;
  // Liga-Modus kommt aus der Mannschaft (Teams spielen verschiedene Ligen)
  let modusZeilen: string[] = [];
  if (istSpiel && modiRes) {
    const teamModus =
      (event.team_id ? teams.get(event.team_id)?.spielmodus : "") ||
      modiRes.liga;
    if (event.type === "match" && teamModus) {
      modusZeilen = [`Modus: ${teamModus}`];
    } else if (event.type === "pokal") {
      modusZeilen = [
        modiRes.pokal ? `Pokal: ${modiRes.pokal}` : "",
        modiRes.achter ? `8ter Cup: ${modiRes.achter}` : "",
      ].filter(Boolean);
    }
  }

  const lineupKopf = [
    `📋 Aufstellung ${event.title}`,
    event.time_tbd || formatTime(event.starts_at) === "00:00"
      ? `${formatDate(event.starts_at)} – Uhrzeit folgt`
      : `${formatDate(event.starts_at)}, Spielbeginn ${formatTime(event.starts_at)} Uhr`,
    event.location ? `📍 ${event.location}` : "",
    event.meet_home_time ? `🚌 Treffpunkt TSG: ${event.meet_home_time} Uhr` : "",
    event.meet_venue_time
      ? `🤝 Treffpunkt vor Ort: ${event.meet_venue_time} Uhr`
      : "",
    ...modusZeilen.map((z) => `🎯 ${z}`),
    (event.match_url ?? "").trim()
      ? `🔗 Spiel live mitverfolgen: ${(event.match_url ?? "").trim()}`
      : "",
  ].filter(Boolean);

  // Fahrgemeinschaft
  const fahrer: CarpoolFahrer[] = [];
  const mitfahrerListe: string[] = [];
  let meineRolle: "fahrer" | "mitfahrer" | null = null;
  let meineSeats: number | null = null;
  if (!spiegel) {
    for (const row of carpoolRes.data ?? []) {
      const name =
        (row.profiles as unknown as { full_name: string } | null)?.full_name ??
        "?";
      if (row.profile_id === profile.id) {
        meineRolle = row.role as "fahrer" | "mitfahrer";
        meineSeats = (row.seats as number | null) ?? null;
      }
      if (row.role === "fahrer") {
        fahrer.push({ name, seats: (row.seats as number | null) ?? null });
      } else {
        mitfahrerListe.push(name);
      }
    }
  }

  // Helferliste (nur bei Heimspielen)
  const helferListe: HelferEintrag[] = [];
  let meineHelferAufgabe: string | null = null;
  if (istHeimspiel) {
    for (const row of helferRes.data ?? []) {
      const name =
        (row.profiles as unknown as { full_name: string } | null)?.full_name ??
        "?";
      if (row.profile_id === profile.id) {
        meineHelferAufgabe = (row.aufgabe as string) ?? "";
      }
      helferListe.push({ name, aufgabe: (row.aufgabe as string) || "hilft mit" });
    }
    helferListe.sort((a, b) => a.name.localeCompare(b.name));
  }

  // Heimspiel-Nachricht an den Gegner (nur für Kapitän/Vize/Bearbeiter/Admin)
  let gegnerText: string | null = null;
  if (istSpiel && canManage && event.home_away === "heim" && vorlageRes) {
    const ansprech =
      (oppRes.data?.contact_name as string | undefined) || "zusammen";
    const vorlage = vorlageRes;
    const uhr =
      event.time_tbd || formatTime(event.starts_at) === "00:00"
        ? "…"
        : formatTime(event.starts_at);
    gegnerText = vorlage
      .replaceAll("{ansprechpartner}", ansprech)
      .replaceAll("{kapitaen}", profile.full_name || "Kapitän")
      .replaceAll("{mannschaft}", teamName ?? "TSG 08 Roth")
      .replaceAll("{datum}", formatDate(event.starts_at))
      .replaceAll("{uhrzeit}", uhr);
    // 2k-Link zum Spiel: Platzhalter {spiellink} ersetzen – ohne
    // Platzhalter wird der Link automatisch ans Ende angehängt.
    const spielLink = (event.match_url ?? "").trim();
    if (spielLink) {
      gegnerText = gegnerText.includes("{spiellink}")
        ? gegnerText.replaceAll("{spiellink}", spielLink)
        : `${gegnerText}\n\nHier kommt ihr direkt zu unserem Spiel in der 2k-Software (auch zum Live-Mitverfolgen): ${spielLink}`;
    } else {
      // Kein Link hinterlegt: Zeilen mit dem Platzhalter weglassen
      gegnerText = gegnerText
        .split("\n")
        .filter((zeile) => !zeile.includes("{spiellink}"))
        .join("\n");
    }
  }

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
          (event.time_tbd
            ? `${formatDate(event.starts_at)} – ⏳ genaue Uhrzeit folgt`
            : formatDateTime(event.starts_at)) +
          (event.ends_at
            ? ` – ${formatUntil(event.starts_at, event.ends_at)}`
            : "")
        }
      />

      {trainerNames.length > 0 && (
        <p className="text-sm text-muted">
          💪 Trainer: {trainerNames.join(", ")}
        </p>
      )}

      {kontakte.length > 0 && (
        <p className="text-sm text-muted">
          👤 Ansprechpartner:{" "}
          {kontakte
            .map((k) => `${k.full_name}${k.phone ? ` (📱 ${k.phone})` : ""}`)
            .join(" · ")}
        </p>
      )}

      {modusZeilen.length > 0 && (
        <p className="text-sm text-muted">🎯 {modusZeilen.join(" · ")}</p>
      )}

      {(event.result ?? "").trim() && (
        <p className="text-sm font-semibold">
          🏁 Endergebnis: {(event.result ?? "").trim()}
        </p>
      )}

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
        {(event.match_url ?? "").trim() && (
          <a
            href={(event.match_url ?? "").trim()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
          >
            🎯 Spiel live mitverfolgen (2k)
          </a>
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

      {/* Gespiegelte Competition-Abende: reine Anzeige, keine Zu-/Absage –
          die Anmeldung läuft über die Competition-App */}
      {spiegel ? (
        <Card className="bg-primary/5">
          <CardBody className="text-sm text-muted">
            🎯 Dieser Competition-Abend wird in der Competition-App gepflegt –
            hier ist keine Zu-/Absage nötig.
          </CardBody>
        </Card>
      ) : (
        <>
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

      {/* Aufstellung: Kapitän baut den Entwurf, gibt frei → Push an den Kader */}
      {istSpiel && (canManage || (lineupReleased && lineupEntries.length > 0)) && (
        <Card>
          <CardBody className="space-y-2">
            <p className="font-medium">📋 Aufstellung</p>
            <LineupSection
              eventId={event.id}
              canManage={canManage}
              released={lineupReleased}
              initialEntries={lineupEntries}
              roster={roster}
              kopfzeilen={lineupKopf}
            />
          </CardBody>
        </Card>
      )}

      {/* Fahrgemeinschaft */}
      <Card>
        <CardBody className="space-y-2">
          <p className="font-medium">🚗 Fahrgemeinschaft</p>
          <CarpoolSection
            eventId={event.id}
            meineRolle={meineRolle}
            meineSeats={meineSeats}
            fahrer={fahrer}
            mitfahrer={mitfahrerListe}
          />
        </CardBody>
      </Card>

      {/* Helferliste bei Heimspielen */}
      {istHeimspiel && (
        <details
          className="rounded-xl border border-border bg-surface"
          open={helferListe.length > 0}
        >
          <summary className="cursor-pointer px-5 py-4 font-semibold">
            🙌 Helferliste (Heimspiel)
            {helferListe.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted">
                {helferListe.length} Helfer
              </span>
            )}
          </summary>
          <div className="border-t border-border p-5">
            <HelferSection
              eventId={event.id}
              meineAufgabe={meineHelferAufgabe}
              helfer={helferListe}
            />
          </div>
        </details>
      )}

      {/* Ergebnis melden */}
      {istSpiel && canManage && (
        <details className="rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-4 font-semibold">
            🏁 Ergebnis melden
          </summary>
          <div className="border-t border-border p-5">
            <ErgebnisMelden
              eventId={event.id}
              initialResult={(event.result ?? "").trim()}
            />
          </div>
        </details>
      )}

      {istSpiel && canManage && (
        <details className="rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-4 font-semibold">
            🔗 2k-Link zu diesem Spiel
          </summary>
          <div className="border-t border-border p-5">
            <MatchUrlForm
              eventId={event.id}
              initialUrl={(event.match_url ?? "").trim()}
            />
          </div>
        </details>
      )}

      {gegnerText && (
        <details className="rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-4 font-semibold">
            💬 Nachricht an den Gegner (Heimspiel)
          </summary>
          <div className="border-t border-border p-5">
            <GegnerNachricht text={gegnerText} />
          </div>
        </details>
      )}

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
                        {(g.key === "no" || g.key === "maybe") && p.comment && (
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
        </>
      )}
    </div>
  );
}
