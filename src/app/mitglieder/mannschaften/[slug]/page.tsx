import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { getTeamBySlug } from "@/lib/queries";
import { getTeamRoster, getManageableTeamIds } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import { createTeamEvent, updateTeamEvent, deleteTeamEvent } from "./actions";
import { berlinISOToLocalInput } from "@/lib/tz";
import { NuLigaEmbed } from "@/components/NuLigaEmbed";
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
  const manageable = await getManageableTeamIds(profile);
  const canManage = manageable.has(team.id);

  let teamEvents: EventRow[] = [];
  if (canManage) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("events")
      .select("*")
      .eq("team_id", team.id)
      .gte("starts_at", new Date(Date.now() - 7 * 864e5).toISOString())
      .order("starts_at", { ascending: true });
    teamEvents = (data as EventRow[]) ?? [];
  }

  return (
    <div className="space-y-6">
      <Link
        href="/mitglieder/mannschaften"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Mannschaften
      </Link>
      <PageHeader title={team.name} subtitle={team.league ?? undefined} />

      {/* Kader */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Kader{" "}
          <span className="text-sm font-normal text-muted">
            ({roster.length})
          </span>
        </h2>
        {roster.length === 0 ? (
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
            </CardBody>
          </Card>
        )}
      </section>

      {/* Termin-Verwaltung für Kapitäne/Admins */}
      {canManage && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Team-Termine verwalten</h2>
            <Badge tone="primary">Kapitän/Admin</Badge>
          </div>

          <Card>
            <CardBody>
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
                <Button type="submit">Termin anlegen</Button>
              </form>
            </CardBody>
          </Card>

          {teamEvents.length > 0 && (
            <div className="space-y-2">
              {teamEvents.map((ev) => (
                <Card key={ev.id}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="primary">
                            {EVENT_TYPE_LABELS[ev.type]}
                          </Badge>
                          {ev.source === "nuliga" && <Badge>nuLiga</Badge>}
                          {!ev.is_public && <Badge tone="warn">intern</Badge>}
                          <span className="font-medium">{ev.title}</span>
                        </div>
                        <p className="mt-1 text-sm text-muted">
                          {formatDate(ev.starts_at)} · {formatTime(ev.starts_at)} Uhr
                          {ev.location ? ` · ${ev.location}` : ""}
                        </p>
                      </div>
                      <form action={deleteTeamEvent.bind(null, slug)}>
                        <input type="hidden" name="team_id" value={team.id} />
                        <input type="hidden" name="event_id" value={ev.id} />
                        <button className="text-sm text-danger hover:underline">
                          Löschen
                        </button>
                      </form>
                    </div>

                    {/* Bearbeiten (aufklappbar, vorausgefüllt) */}
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
                        <Button type="submit">Änderungen speichern</Button>
                      </form>
                    </details>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* nuLiga */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Tabelle & Spielplan (nuLiga)</h2>
        <NuLigaEmbed url={team.nuliga_url} title={`nuLiga – ${team.name}`} />
      </section>
    </div>
  );
}
