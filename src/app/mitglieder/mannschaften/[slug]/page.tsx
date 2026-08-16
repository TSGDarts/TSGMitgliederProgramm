import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getTeamBySlug } from "@/lib/queries";
import { getTeamRoster, getManageableTeamIds } from "@/lib/member-queries";
import { listTeamInvites } from "@/lib/invites";
import { createClient } from "@/lib/supabase/server";
import { createTeamEvent, updateTeamEvent, deleteTeamEvent } from "./actions";
import {
  berlinISOToLocalInput,
  berlinLocalToISO,
} from "@/lib/tz";
import { NuLigaEmbed } from "@/components/NuLigaEmbed";
import { LigaTabelle } from "@/components/LigaTabelle";
import { LineupSection } from "@/components/LineupSection";
import { Einklappbar } from "@/components/Einklappbar";
import { ladeNuligaTabelle } from "@/lib/nuliga-tabelle";
import { formatHomeMatch } from "@/lib/extras";
import { getSpielModi } from "@/lib/settings";
import {
  lineupModeKeyForEvent,
  lineupModeOptionsForEvent,
} from "@/lib/lineup";
import type { LineupEintrag } from "@/app/mitglieder/termine/spieltag-actions";
import {
  PageHeader,
  Card,
  CardBody,
  Badge,
  EmptyState,
  Button,
  Field,
  inputClass,
} from "@/components/ui";
import { EVENT_TYPE_LABELS, type EventRow } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/format";

export default async function MemberTeamDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await requireProfile();
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const roster = await getTeamRoster(team.id);
  // Vorab angelegte Namen (noch nicht registriert), die diesem Team
  // zugeordnet sind – gehören zum Kader, nur ohne eigenen Zugang.
  const teamInvites = await listTeamInvites(team.id);
  const manageable = await getManageableTeamIds(profile);
  const canManage = manageable.has(team.id);

  const supabase = await createClient();
  // Request-Zeitpunkt für die dynamische Terminabfrage der Server-Seite.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const todayBerlin = berlinISOToLocalInput(new Date(now).toISOString()).slice(
    0,
    10,
  );
  const eventCutoff = canManage
    ? new Date(now - 7 * 864e5).toISOString()
    : berlinLocalToISO(`${todayBerlin}T00:00`)!;

  // Spieltermine werden auch für normale Mitglieder geladen, damit eine
  // veröffentlichte Aufstellung direkt unter der Mannschaft sichtbar ist.
  const [tabelle, eventsRes, modi] = await Promise.all([
    ladeNuligaTabelle(team.nuliga_table_url || team.nuliga_url || ""),
    supabase
      .from("events")
      .select("*")
      .eq("team_id", team.id)
      .gte("starts_at", eventCutoff)
      .order("starts_at", { ascending: true }),
    getSpielModi(),
  ]);
  const geladeneEvents = (eventsRes.data as EventRow[] | null) ?? [];
  const teamEvents = canManage ? geladeneEvents : [];
  const aufstellungsEvents = geladeneEvents.filter(
    (event) =>
      berlinISOToLocalInput(event.starts_at).slice(0, 10) >= todayBerlin &&
      ["match", "pokal", "friendly"].includes(event.type),
  );

  const lineupByEvent = new Map<
    string,
    { entries: LineupEintrag[]; released: boolean }
  >();
  if (aufstellungsEvents.length > 0) {
    const { data } = await supabase
      .from("event_lineups")
      .select("event_id, entries, released")
      .in(
        "event_id",
        aufstellungsEvents.map((event) => event.id),
      );
    for (const row of data ?? []) {
      lineupByEvent.set(row.event_id as string, {
        entries: Array.isArray(row.entries)
          ? (row.entries as unknown as LineupEintrag[])
          : [],
        released: !!row.released,
      });
    }
  }

  const sichtbareAufstellungsEvents = canManage
    ? aufstellungsEvents
    : aufstellungsEvents.filter((event) => {
        const lineup = lineupByEvent.get(event.id);
        return (
          !!lineup?.released &&
          lineup.entries.some((entry) => entry && entry.name)
        );
      });
  const lineupRoster = [
    ...roster.map((member) => ({
      id: member.profile_id,
      name: member.profile.full_name || member.profile.email || "?",
    })),
    ...teamInvites.map((invite) => ({
      id: invite.id,
      inviteId: invite.id,
      name: invite.full_name,
    })),
  ];

  return (
    <div className="space-y-6">
      <Link
        href="/mitglieder/mannschaften"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Mannschaften
      </Link>
      <PageHeader title={team.name} subtitle={team.league ?? undefined} />

      {formatHomeMatch(team.home_match_weekday, team.home_match_time) && (
        <Card className="bg-primary/5">
          <CardBody className="py-3 text-sm">
            🕗 <strong>Heimspiele:</strong>{" "}
            {formatHomeMatch(team.home_match_weekday, team.home_match_time)}
          </CardBody>
        </Card>
      )}

      {(canManage || sichtbareAufstellungsEvents.length > 0) && (
        <section id="aufstellungen" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">
              📋 Voraussichtliche Aufstellungen
            </h2>
            {canManage && <Badge tone="primary">Kapitän/Admin</Badge>}
          </div>
          {canManage && (
            <p className="text-sm text-muted">
              Wähle den kommenden Spieltag, stelle Einzel und Doppel passend
              zum Mannschaftsmodus auf und veröffentliche den Entwurf für den
              Kader.
            </p>
          )}

          {sichtbareAufstellungsEvents.length === 0 ? (
            <EmptyState
              title="Kein kommender Spieltag"
              hint="Sobald ein Punkt-, Pokal- oder Freundschaftsspiel angelegt ist, kann hier die Aufstellung geplant werden."
            />
          ) : (
            <div className="space-y-2">
              {sichtbareAufstellungsEvents.map((event, index) => {
                const lineup = lineupByEvent.get(event.id) ?? {
                  entries: [],
                  released: false,
                };
                const modusOptionen = lineupModeOptionsForEvent(
                  event,
                  team.spielmodus,
                  modi,
                );
                const modusMeta = lineup.entries.find(
                  (entry) => entry.entry_type === "mode",
                );
                const spielerEintraege = lineup.entries.filter(
                  (entry) => entry.entry_type !== "mode",
                );
                const gespeicherterModus =
                  modusMeta?.mode_key ??
                  spielerEintraege.find((entry) => entry.mode_key)?.mode_key;
                const modusKey = lineupModeKeyForEvent(
                  event,
                  modusOptionen,
                  gespeicherterModus,
                  spielerEintraege.length > 0,
                );
                const kopfzeilen = [
                  `📋 Voraussichtliche Aufstellung ${event.title}`,
                  event.time_tbd || formatTime(event.starts_at) === "00:00"
                    ? `${formatDate(event.starts_at)} – Uhrzeit folgt`
                    : `${formatDate(event.starts_at)}, Spielbeginn ${formatTime(event.starts_at)} Uhr`,
                  event.location ? `📍 ${event.location}` : "",
                  event.meet_home_time
                    ? `🚌 Treffpunkt TSG: ${event.meet_home_time} Uhr`
                    : "",
                  event.meet_venue_time
                    ? `🤝 Treffpunkt vor Ort: ${event.meet_venue_time} Uhr`
                    : "",
                  (event.match_url ?? "").trim()
                    ? `🔗 Spiel live mitverfolgen: ${(event.match_url ?? "").trim()}`
                    : "",
                ].filter(Boolean);

                return (
                  <details
                    key={event.id}
                    open={index === 0}
                    className="group rounded-xl border border-border bg-surface shadow-sm"
                  >
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone="primary">
                            {EVENT_TYPE_LABELS[event.type]}
                          </Badge>
                          {lineup.released ? (
                            <Badge tone="ok">Veröffentlicht</Badge>
                          ) : lineup.entries.length > 0 ? (
                            <Badge tone="warn">Entwurf</Badge>
                          ) : (
                            <Badge>Noch nicht aufgestellt</Badge>
                          )}
                          <span className="font-medium">{event.title}</span>
                        </span>
                        <span className="mt-1 block text-sm text-muted">
                          {formatDate(event.starts_at)} ·{" "}
                          {event.time_tbd
                            ? "⏳ Uhrzeit folgt"
                            : `${formatTime(event.starts_at)} Uhr`}
                          {event.home_away === "heim"
                            ? " · Heimspiel"
                            : event.home_away === "auswaerts"
                              ? " · Auswärtsspiel"
                              : ""}
                        </span>
                      </span>
                      <span
                        aria-hidden
                        className="shrink-0 text-muted transition-transform group-open:rotate-180"
                      >
                        ▾
                      </span>
                    </summary>
                    <div className="space-y-4 border-t border-border p-5">
                      <LineupSection
                        eventId={event.id}
                        canManage={canManage}
                        released={lineup.released}
                        initialEntries={spielerEintraege}
                        roster={lineupRoster}
                        kopfzeilen={kopfzeilen}
                        modusOptionen={modusOptionen}
                        initialModusKey={modusKey}
                        initialModusSnapshot={modusMeta?.mode_snapshot}
                      />
                      <Link
                        href={`/mitglieder/termine/${event.id}`}
                        className="inline-block text-sm text-primary hover:underline"
                      >
                        Zum vollständigen Spieltag →
                      </Link>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      )}

      <Einklappbar
        id={`mannschaft-${team.id}-nuliga-v2`}
        title="📋 Kompletter Spielplan bei nuLiga"
        defaultOpen={false}
      >
        <NuLigaEmbed url={team.nuliga_url} title={`nuLiga – ${team.name}`} />
      </Einklappbar>

      {/* Liga-Tabelle (live aus nuLiga) */}
      {tabelle && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            🏆 Liga-Tabelle
            {tabelle.titel && (
              <span className="ml-2 text-sm font-normal text-muted">
                {tabelle.titel}
              </span>
            )}
          </h2>
          <Card>
            <CardBody>
              <LigaTabelle tabelle={tabelle} eigenerName={team.name} />
            </CardBody>
          </Card>
        </section>
      )}

      {/* Termin-Verwaltung für Kapitäne/Admins */}
      {canManage && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Team-Termine verwalten</h2>
            <Badge tone="primary">Kapitän/Admin</Badge>
          </div>

          <details className="group rounded-xl border border-border bg-surface shadow-sm">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 font-medium text-primary [&::-webkit-details-marker]:hidden">
              <span>➕ Neuen Termin anlegen</span>
              <span
                aria-hidden
                className="text-muted transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="border-t border-border p-5">
              <form
                action={createTeamEvent.bind(null, slug)}
                className="space-y-4"
              >
                <input type="hidden" name="team_id" value={team.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Titel">
                    <input name="title" required className={inputClass} />
                  </Field>
                  <Field label="Art">
                    <select
                      name="type"
                      defaultValue="match"
                      className={inputClass}
                    >
                      {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Datum & Uhrzeit">
                    <input
                      name="starts_at"
                      type="datetime-local"
                      required
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Ort (optional)">
                    <input name="location" className={inputClass} />
                  </Field>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="is_public" defaultChecked />
                  Im öffentlichen Kalender anzeigen
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="time_tbd" />
                  ⏳ Genaue Uhrzeit noch nicht bekannt – „Uhrzeit folgt“ anzeigen
                </label>
                <Button type="submit">Termin anlegen</Button>
              </form>
            </div>
          </details>

          {teamEvents.length > 0 && (
            <div className="space-y-2">
              {(() => {
                const eventCards = teamEvents.map((ev, index) => (
                <details
                  key={ev.id}
                  open={index === 0}
                  className="group rounded-xl border border-border bg-surface shadow-sm"
                >
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone="primary">
                          {EVENT_TYPE_LABELS[ev.type]}
                        </Badge>
                        {ev.source === "nuliga" && <Badge>nuLiga</Badge>}
                        {!ev.is_public && <Badge tone="warn">intern</Badge>}
                        <span className="font-medium">{ev.title}</span>
                      </span>
                      <span className="mt-1 block text-sm text-muted">
                        {formatDate(ev.starts_at)} ·{" "}
                        {ev.time_tbd
                          ? "⏳ Uhrzeit folgt"
                          : `${formatTime(ev.starts_at)} Uhr`}
                        {ev.location ? ` · ${ev.location}` : ""}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      className="shrink-0 text-muted transition-transform group-open:rotate-180"
                    >
                      ▾
                    </span>
                  </summary>

                  <div className="space-y-4 border-t border-border p-5">
                    {ev.description && (
                      <p className="text-sm text-muted">{ev.description}</p>
                    )}
                    <div className="flex justify-end">
                      <form action={deleteTeamEvent.bind(null, slug)}>
                        <input type="hidden" name="team_id" value={team.id} />
                        <input type="hidden" name="event_id" value={ev.id} />
                        <button
                          type="submit"
                          className="text-sm text-danger hover:underline"
                          aria-label={`Termin ${ev.title} löschen`}
                        >
                          Löschen
                        </button>
                      </form>
                    </div>

                    <details className="rounded-lg border border-border">
                      <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
                        ✏️ Bearbeiten
                      </summary>
                      <form
                        action={updateTeamEvent.bind(null, slug)}
                        className="space-y-4 border-t border-border p-4"
                      >
                        <input type="hidden" name="team_id" value={team.id} />
                        <input type="hidden" name="event_id" value={ev.id} />
                        {ev.source === "nuliga" && (
                          <p className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">
                            Hinweis: Dieser Termin stammt aus nuLiga. Änderungen
                            können beim nächsten nuLiga-Import überschrieben
                            werden.
                          </p>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Titel">
                            <input
                              name="title"
                              required
                              defaultValue={ev.title}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Art">
                            <select
                              name="type"
                              defaultValue={ev.type}
                              className={inputClass}
                            >
                              {Object.entries(EVENT_TYPE_LABELS).map(
                                ([v, l]) => (
                                  <option key={v} value={v}>
                                    {l}
                                  </option>
                                ),
                              )}
                            </select>
                          </Field>
                          <Field label="Datum & Uhrzeit">
                            <input
                              name="starts_at"
                              type="datetime-local"
                              required
                              defaultValue={berlinISOToLocalInput(ev.starts_at)}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Ort (optional)">
                            <input
                              name="location"
                              defaultValue={ev.location ?? ""}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Beschreibung (optional)">
                            <input
                              name="description"
                              defaultValue={ev.description ?? ""}
                              className={inputClass}
                            />
                          </Field>
                        </div>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="is_public"
                            defaultChecked={ev.is_public}
                          />
                          Im öffentlichen Kalender anzeigen
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="time_tbd"
                            defaultChecked={ev.time_tbd ?? false}
                          />
                          ⏳ Genaue Uhrzeit noch nicht bekannt – „Uhrzeit folgt“
                          anzeigen
                        </label>
                        <Button type="submit">Änderungen speichern</Button>
                      </form>
                    </details>
                  </div>
                </details>
                ));
                const [firstEventCard, ...moreEventCards] = eventCards;

                return (
                  <>
                    {firstEventCard}
                    {moreEventCards.length > 0 && (
                      <details className="group/weitere">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-3 font-medium text-primary shadow-sm [&::-webkit-details-marker]:hidden">
                          <span className="group-open/weitere:hidden">
                            {moreEventCards.length === 1
                              ? "1 weiteren Termin anzeigen"
                              : `Weitere ${moreEventCards.length} Termine anzeigen`}
                          </span>
                          <span className="hidden group-open/weitere:inline">
                            {moreEventCards.length === 1
                              ? "1 weiteren Termin ausblenden"
                              : `Weitere ${moreEventCards.length} Termine ausblenden`}
                          </span>
                          <span
                            aria-hidden
                            className="shrink-0 text-muted transition-transform group-open/weitere:rotate-180"
                          >
                            ▾
                          </span>
                        </summary>
                        <div className="mt-2 space-y-2">
                          {moreEventCards}
                        </div>
                      </details>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </section>
      )}

      {/* Mannschaftsmitglieder bewusst am Seitenende */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Mannschaftsmitglieder{" "}
          <span className="text-sm font-normal text-muted">
            ({roster.length + teamInvites.length})
          </span>
        </h2>
        {roster.length === 0 && teamInvites.length === 0 ? (
          <EmptyState
            title="Noch keine Spieler zugeordnet"
            hint="Spieler werden unter „Mannschaften verwalten“ hinzugefügt."
          />
        ) : (
          <Card>
            <CardBody className="divide-y divide-border p-0">
              {roster.map((m) => (
                <div
                  key={m.profile_id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    {m.jersey_number != null && (
                      <span className="w-6 text-center text-sm font-bold text-muted">
                        {m.jersey_number}
                      </span>
                    )}
                    <span className="font-medium">
                      {m.profile.full_name || m.profile.email}
                    </span>
                    {m.is_captain && <Badge tone="primary">Kapitän</Badge>}
                    {m.is_vice_captain && <Badge>Vize</Badge>}
                  </div>
                  {m.profile.phone && (
                    <a
                      href={`tel:${m.profile.phone}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {m.profile.phone}
                    </a>
                  )}
                </div>
              ))}
              {/* Vorab angelegte Namen (noch nicht angemeldet) */}
              {teamInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{inv.full_name}</span>
                    {inv.captain_of === team.id && (
                      <Badge tone="primary">Kapitän</Badge>
                    )}
                    {inv.vice_of === team.id && <Badge>Vize</Badge>}
                    <Badge tone="warn">noch nicht angemeldet</Badge>
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </section>
    </div>
  );
}
