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
import { listTeamInvites } from "@/lib/invites";
import { RsvpButtons } from "@/components/RsvpButtons";
import { AddressLine } from "@/components/AddressLine";
import {
  CarpoolSection,
  type CarpoolFahrer,
  type CarpoolMitfahrer,
} from "@/components/CarpoolSection";
import { HelferSection, type HelferEintrag } from "@/components/HelferSection";
import { LineupSection } from "@/components/LineupSection";
import { GegnerNachricht } from "@/components/GegnerNachricht";
import { MatchUrlForm } from "@/components/MatchUrlForm";
import { ErgebnisMelden } from "@/components/ErgebnisMelden";
import type { LineupEintrag } from "@/app/mitglieder/termine/spieltag-actions";
import { erinnereOhneAntwort } from "@/app/mitglieder/termine/actions";
import { PageHeader, Card, CardBody, Badge, Button } from "@/components/ui";
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
import {
  lineupModeKeyForEvent,
  lineupModeOptionsForEvent,
} from "@/lib/lineup";

const groups: { key: RsvpStatus | "open"; label: string; tone: string }[] = [
  { key: "yes", label: "Zusagen", tone: "text-ok" },
  { key: "maybe", label: "Vielleicht", tone: "text-warn" },
  { key: "no", label: "Absagen", tone: "text-danger" },
  { key: "open", label: "Keine Rückmeldung", tone: "text-muted" },
];

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ angestupst?: string; fehler?: string }>;
}) {
  const { id } = await params;
  const { angestupst, fehler } = await searchParams;
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
    inviteRoh,
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
    istSpiel && canManage
      ? listTeamInvites(event.team_id!)
      : Promise.resolve([]),
    istSpiel ? getSpielModi() : Promise.resolve(null),
    !spiegel
      ? supabase
          .from("event_carpool")
          .select("profile_id, role, seats, ort, ziel, abfahrt, fahrer_id, profiles(full_name)")
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
  const lineupModusMeta = lineupEntries.find(
    (entry) => entry.entry_type === "mode",
  );
  const lineupSpielerEintraege = lineupEntries.filter(
    (entry) => entry.entry_type !== "mode",
  );
  const roster = [
    ...rosterRoh.map((member) => ({
      id: member.profile_id,
      name: member.profile.full_name || member.profile.email || "?",
    })),
    ...inviteRoh.map((invite) => ({
      id: invite.id,
      inviteId: invite.id,
      name: invite.full_name,
    })),
  ];

  // Spielmodus (vom Admin gepflegt); beim Pokal kann der Kapitän zwischen
  // den beiden hinterlegten Wettbewerben wählen. Die Auswahl steckt
  // migrationsfrei in den JSON-Einträgen der Aufstellung.
  const modusOptionen =
    istSpiel && modiRes
      ? lineupModeOptionsForEvent(
          event,
          event.team_id ? teams.get(event.team_id)?.spielmodus : "",
          modiRes,
        )
      : [];
  const gespeicherterModus =
    lineupModusMeta?.mode_key ??
    lineupSpielerEintraege.find((entry) => entry.mode_key)?.mode_key;
  const lineupModusKey = lineupModeKeyForEvent(
    event,
    modusOptionen,
    gespeicherterModus,
    lineupSpielerEintraege.length > 0,
  );
  const lineupModus =
    lineupModusMeta?.mode_snapshot?.trim() ||
    modusOptionen.find((option) => option.key === lineupModusKey)?.mode ||
    "";
  const modusZeilen = lineupModus ? [`Modus: ${lineupModus}`] : [];

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
    (event.match_url ?? "").trim()
      ? `🔗 Spiel live mitverfolgen: ${(event.match_url ?? "").trim()}`
      : "",
  ].filter(Boolean);

  // Fahrgemeinschaft
  const fahrer: CarpoolFahrer[] = [];
  const mitfahrerListe: CarpoolMitfahrer[] = [];
  let meineRolle: "fahrer" | "mitfahrer" | null = null;
  let meineSeats: number | null = null;
  let meinOrt = "";
  let meinZiel = "";
  let meineAbfahrt = "";
  let meinFahrerId: string | null = null;
  if (!spiegel) {
    for (const row of carpoolRes.data ?? []) {
      const name =
        (row.profiles as unknown as { full_name: string } | null)?.full_name ??
        "?";
      const profileId = row.profile_id as string;
      const ort = (row.ort as string | null) ?? "";
      const ziel = (row.ziel as string | null) ?? "";
      const abfahrt = (row.abfahrt as string | null) ?? "";
      const fahrerId = (row.fahrer_id as string | null) ?? null;
      if (profileId === profile.id) {
        meineRolle = row.role as "fahrer" | "mitfahrer";
        meineSeats = (row.seats as number | null) ?? null;
        meinOrt = ort;
        meinZiel = ziel;
        meineAbfahrt = abfahrt;
        meinFahrerId = fahrerId;
      }
      if (row.role === "fahrer") {
        fahrer.push({
          profileId,
          name,
          seats: (row.seats as number | null) ?? null,
          ort,
          ziel,
          abfahrt,
        });
      } else {
        mitfahrerListe.push({ profileId, name, ort, ziel, abfahrt, fahrerId });
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

  // „Anstupsen“: Erinnerung an alle ohne Antwort (Kapitän/Vize des Teams,
  // bei Vereinsterminen Admin/Bearbeiter). Zählt den Betrachter selbst
  // nicht mit – die Action erinnert ihn auch nicht.
  const ohneAntwort = byStatus("open").filter(
    (p) => p.profile.id !== profile.id,
  );
  const terminVorbei =
    new Date(event.ends_at ?? event.starts_at).getTime() < Date.now();
  const darfAnstupsen =
    !spiegel &&
    !event.info_only &&
    !terminVorbei &&
    (profile.role === "admin" || profile.role === "editor" || canManage);

  return (
    <div className="space-y-6">
      <Link
        href="/mitglieder/termine"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Termine
      </Link>

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody className="text-sm">
            <span className="font-semibold text-danger">⚠️ </span>
            {fehler}
          </CardBody>
        </Card>
      ) : null}

      {angestupst ? (
        <Card className="border-ok/40 bg-ok/10">
          <CardBody className="text-sm font-semibold text-ok">
            ✓ Erinnerung verschickt – an{" "}
            {Number(angestupst) === 1
              ? "1 Person"
              : `${Number(angestupst) || 0} Personen`}{" "}
            ohne Antwort.
          </CardBody>
        </Card>
      ) : null}

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
        <a
          href={`/mitglieder/termine/${event.id}/ics`}
          title="Termin als Kalender-Datei herunterladen und in den Handy-Kalender übernehmen"
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-border/40"
        >
          📅 In meinen Kalender
        </a>
        {event.info_only && <Badge tone="warn">📢 nur zur Info</Badge>}
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
      {event.info_only ? (
        <Card className="bg-primary/5">
          <CardBody className="text-sm text-muted">
            📢 Dieser Termin ist <strong>nur zur Info</strong> – keine
            Zu-/Absage nötig.
          </CardBody>
        </Card>
      ) : (
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
      )}

      {/* Aufstellung: Kapitän baut den Entwurf, gibt frei → Push an den Kader */}
      {istSpiel &&
        (canManage ||
          (lineupReleased && lineupSpielerEintraege.length > 0)) && (
          <Card>
            <CardBody className="space-y-2">
              <p className="font-medium">📋 Aufstellung</p>
              <LineupSection
                eventId={event.id}
                canManage={canManage}
                released={lineupReleased}
                initialEntries={lineupSpielerEintraege}
                roster={roster}
                kopfzeilen={lineupKopf}
                modusOptionen={modusOptionen}
                initialModusKey={lineupModusKey}
                initialModusSnapshot={lineupModusMeta?.mode_snapshot}
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
            meinOrt={meinOrt}
            meinZiel={meinZiel}
            meineAbfahrt={meineAbfahrt}
            meinFahrerId={meinFahrerId}
            zielVorgabe={event.location ?? ""}
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

      {!event.info_only && (
      <>
      {darfAnstupsen && ohneAntwort.length > 0 && (
        <form action={erinnereOhneAntwort}>
          <input type="hidden" name="eventId" value={event.id} />
          <Button type="submit" variant="secondary">
            🔔 Erinnerung an alle ohne Antwort senden ({ohneAntwort.length})
          </Button>
          <p className="mt-1 text-xs text-muted">
            Schickt allen unter „Keine Rückmeldung“ einen Push (und ggf.
            E-Mail) – höchstens einmal pro Tag.
          </p>
        </form>
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
        </>
      )}
    </div>
  );
}
