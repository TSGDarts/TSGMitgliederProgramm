import type { Metadata } from "next";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import {
  createEvent,
  updateEvent,
  deleteEvent,
  saveArchiveDays,
  toggleFeedExport,
} from "./actions";
import { berlinISOToLocalInput } from "@/lib/tz";
import { getEventArchiveDays, archiveCutoffIso } from "@/lib/settings";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  inputClass,
  Badge,
  EmptyState,
} from "@/components/ui";
import { Einklappbar } from "@/components/Einklappbar";
import {
  EVENT_TYPE_LABELS,
  type EventRow,
  type Profile,
  type Opponent,
} from "@/lib/types";
import { formatDate, formatDateTime, formatUntil } from "@/lib/format";

export const metadata: Metadata = { title: "Termine verwalten" };

/**
 * Landet dieser Termin überhaupt im Dart-Feed (Competition-App)?
 * Vereinstermine: Art „Sonstiges“ oder „Fest“ ohne Mannschaft. Spieltermine:
 * Punkt-/Pokal-/Freundschaftsspiele einer Mannschaft. Jeweils nur öffentlich.
 */
function feedEligible(ev: EventRow): boolean {
  if (!ev.is_public) return false;
  if (ev.team_id === null) return ["other", "fest"].includes(ev.type);
  return ["match", "pokal", "friendly"].includes(ev.type);
}

/** Gegner-, Mannschafts-Nr.- und Heim/Auswärts-Felder für Terminformulare. */
function OpponentFields({
  opponents,
  defaults,
}: {
  opponents: Opponent[];
  defaults?: {
    opponent_id?: string | null;
    opponent_team_no?: number | null;
    home_away?: string | null;
  };
}) {
  return (
    <>
      <Field
        label="Gegner (optional)"
        hint="Vereine mit Adresse unter „Gegner verwalten“ pflegen"
      >
        <select
          name="opponent_id"
          defaultValue={defaults?.opponent_id ?? ""}
          className={inputClass}
        >
          <option value="">– kein Gegner –</option>
          {opponents.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label="Gegner-Mannschaft (Nr.)"
        hint="Die wievielte Mannschaft des Gegners – beliebige Zahl"
      >
        <input
          name="opponent_team_no"
          type="number"
          min={1}
          defaultValue={defaults?.opponent_team_no ?? 1}
          className={inputClass}
        />
      </Field>
      <Field
        label="Nummern-Anzeige"
        hint="Wie die Nummer im Titel erscheint, z. B. „DC Schwabach II“ oder „DC Schwabach 2“"
      >
        <select name="team_no_style" defaultValue="roemisch" className={inputClass}>
          <option value="roemisch">Römisch (II, III, …)</option>
          <option value="zahl">Zahl (2, 3, …)</option>
        </select>
      </Field>
      <Field label="Heim oder Auswärts">
        <select
          name="home_away"
          defaultValue={defaults?.home_away ?? ""}
          className={inputClass}
        >
          <option value="">–</option>
          <option value="heim">🏠 Heim</option>
          <option value="auswaerts">🚗 Auswärts</option>
        </select>
      </Field>
    </>
  );
}

/** Aufklappbare Teilnehmer-Auswahl (nur Angehakte sehen den Termin). */
/** Ansprechpartner wählen (mehrere möglich) – rein informativ am Termin. */
function ContactPicker({
  members,
  selected,
}: {
  members: Profile[];
  selected?: Set<string>;
}) {
  const count = selected?.size ?? 0;
  return (
    <details
      className="rounded-lg border border-border"
      open={count > 0 ? true : undefined}
    >
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
        👤 Ansprechpartner{" "}
        <span className="text-muted">
          {count > 0 ? `(${count} ausgewählt)` : "(optional)"}
        </span>
      </summary>
      <div className="space-y-2 border-t border-border p-3">
        <p className="text-xs text-muted">
          Wird beim Termin angezeigt (mit Handynummer, falls hinterlegt) –
          z. B. wer die Fahrt organisiert oder Fragen beantwortet.
        </p>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-border/30"
            >
              <input
                type="checkbox"
                name="contact_ids"
                value={m.id}
                defaultChecked={selected?.has(m.id)}
              />
              {m.full_name || m.email}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

function InviteePicker({
  members,
  selected,
}: {
  members: Profile[];
  selected?: Set<string>;
}) {
  const count = selected?.size ?? 0;
  return (
    <details
      className="rounded-lg border border-border"
      open={count > 0 ? true : undefined}
    >
      <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
        👥 Nur bestimmte Teilnehmer einladen{" "}
        <span className="text-muted">
          {count > 0 ? `(${count} ausgewählt)` : "(optional)"}
        </span>
      </summary>
      <div className="space-y-2 border-t border-border p-3">
        <p className="text-xs text-muted">
          Ohne Auswahl gilt der Termin für die gewählte Mannschaft bzw. den
          ganzen Verein. Mit Auswahl sehen <strong>nur die Eingeladenen</strong>{" "}
          diesen Termin – Änderungen greifen sofort.
        </p>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((m) => (
            <label
              key={m.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-border/30"
            >
              <input
                type="checkbox"
                name="invitees"
                value={m.id}
                defaultChecked={selected?.has(m.id)}
              />
              {m.full_name || m.email}
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; gespeichert?: string }>;
}) {
  await requireEditor();
  const { fehler, gespeichert } = await searchParams;
  const teams = await getAllTeams();
  const supabase = await createClient();

  const archiveDays = await getEventArchiveDays();
  const { data } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", archiveCutoffIso(archiveDays))
    .order("starts_at", { ascending: true });
  const events = (data as EventRow[]) ?? [];
  const teamName = (id: string | null) =>
    id ? teams.find((t) => t.id === id)?.name : null;

  // Aktive Mitglieder für die Teilnehmer-Auswahl
  const { data: memberData } = await supabase
    .from("profiles")
    .select("*")
    .eq("is_active", true)
    .order("full_name");
  const members = (memberData as Profile[]) ?? [];

  // Gegner für die Auswahl
  const { data: oppData } = await supabase
    .from("opponents")
    .select("*")
    .order("name");
  const opponents = (oppData as Opponent[]) ?? [];

  // Bestehende Einladungslisten (für Bearbeiten + Badge)
  const inviteesByEvent = new Map<string, Set<string>>();
  if (events.length) {
    const { data: invData } = await supabase
      .from("event_invitees")
      .select("event_id, profile_id")
      .in("event_id", events.map((e) => e.id));
    for (const row of invData ?? []) {
      const set = inviteesByEvent.get(row.event_id as string) ?? new Set();
      set.add(row.profile_id as string);
      inviteesByEvent.set(row.event_id as string, set);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Termine verwalten"
        subtitle="Termine für den Verein oder einzelne Mannschaften anlegen"
      />

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody>
            <p className="font-semibold text-danger">
              ⚠️ Speichern fehlgeschlagen
            </p>
            <p className="mt-1 text-sm">{fehler}</p>
          </CardBody>
        </Card>
      ) : null}

      {gespeichert ? (
        <Card className="border-ok/40 bg-ok/10">
          <CardBody className="font-semibold text-ok">✓ Gespeichert.</CardBody>
        </Card>
      ) : null}

      {/* Archiv-Einstellung */}
      <Einklappbar
        id="admin-termin-archiv"
        title="🗄️ Automatisches Archiv"
        defaultOpen={false}
      >
        <p className="text-sm text-muted">
          Vergangene Termine werden im Kalender grau angezeigt und
          verschwinden nach dieser Frist aus Listen und Kalender (bleiben
          aber gespeichert; der Dart-Feed ist nicht betroffen).
        </p>
        <form action={saveArchiveDays} className="mt-3 flex items-center gap-2">
          <input
            name="archive_days"
            type="number"
            min={1}
            max={365}
            defaultValue={archiveDays}
            className={`${inputClass} w-24`}
          />
          <span className="text-sm text-muted">Tage</span>
          <Button type="submit" variant="secondary">
            Speichern
          </Button>
        </form>
      </Einklappbar>

      <Einklappbar id="admin-termin-anlegen" title="➕ Neuer Termin">
        {/* Schlüssel wechselt nach dem Speichern → Formular wird geleert */}
        <form
          key={gespeichert ?? "neu"}
          action={createEvent}
          className="space-y-4"
        >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Titel (optional bei Gegner)"
                hint="Leer lassen = wird automatisch erzeugt, z. B. „Heim gegen DC Schwabach II“"
              >
                <input name="title" className={inputClass} />
              </Field>
              <Field label="Art">
                <select name="type" className={inputClass} defaultValue="match">
                  {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Datum">
                <input
                  name="starts_date"
                  type="date"
                  required
                  className={inputClass}
                />
              </Field>
              <Field
                label="Startzeit (optional)"
                hint="Leer lassen = „Uhrzeit folgt“"
              >
                <input name="starts_time" type="time" className={inputClass} />
              </Field>
              <Field
                label="Ende – Datum (optional)"
                hint="Für mehrtägige Termine – z. B. ein Fest-Wochenende"
              >
                <input name="ends_date" type="date" className={inputClass} />
              </Field>
              <Field label="Ende – Uhrzeit (optional)">
                <input name="ends_time" type="time" className={inputClass} />
              </Field>
              <Field label="Treffpunkt bei der TSG (optional)" hint="z. B. zum gemeinsamen Fahren">
                <input name="meet_home_time" type="time" className={inputClass} />
              </Field>
              <Field label="Treffpunkt vor Ort (optional)">
                <input name="meet_venue_time" type="time" className={inputClass} />
              </Field>
              <Field label="Mannschaft">
                <select name="team_id" className={inputClass}>
                  <option value="">Gesamter Verein</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <OpponentFields opponents={opponents} />
              <Field
                label="Ort (optional)"
                hint="Leer = automatisch: Heim → unsere Adresse, Auswärts → Gegner-Adresse"
              >
                <input name="location" className={inputClass} />
              </Field>
              <Field label="Beschreibung (optional)">
                <input name="description" className={inputClass} />
              </Field>
              <Field
                label="Online-Link (optional)"
                hint="z. B. Teams-, Meet- oder Zoom-Link – praktisch für Besprechungen"
              >
                <input
                  name="meeting_url"
                  type="url"
                  placeholder="https://teams.microsoft.com/…"
                  className={inputClass}
                />
              </Field>
            </div>
            <ContactPicker members={members} />
            <InviteePicker members={members} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_public" defaultChecked />
              Im öffentlichen Kalender anzeigen
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="time_tbd" />
              ⏳ Genaue Uhrzeit noch nicht bekannt – „Uhrzeit folgt“ anzeigen
              <span className="text-xs text-muted">
                (wird automatisch gesetzt, wenn die Startzeit leer bleibt)
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="feed_export" defaultChecked />
              📤 Automatisch an die Competition-App übergeben
              <span className="text-xs text-muted">
                (gilt nur für öffentliche Vereins- und Spieltermine)
              </span>
            </label>
            <Button type="submit">Termin anlegen</Button>
          </form>
      </Einklappbar>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Kommende Termine</h2>
        {events.length === 0 ? (
          <EmptyState title="Keine Termine" />
        ) : (
          events.map((ev) => (
            <Card key={ev.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{EVENT_TYPE_LABELS[ev.type]}</Badge>
                      <Badge>{teamName(ev.team_id) ?? "Verein"}</Badge>
                      {ev.source === "nuliga" && <Badge>nuLiga</Badge>}
                      {(ev.source_uid ?? "").startsWith("comp-app:") && (
                        <Badge>🎯 aus der Competition-App</Badge>
                      )}
                      {ev.home_away === "heim" && <Badge tone="ok">🏠 Heim</Badge>}
                      {ev.home_away === "auswaerts" && (
                        <Badge tone="warn">🚗 Auswärts</Badge>
                      )}
                      {!ev.is_public && <Badge tone="warn">intern</Badge>}
                      {(inviteesByEvent.get(ev.id)?.size ?? 0) > 0 && (
                        <Badge tone="warn">
                          👥 nur Eingeladene ({inviteesByEvent.get(ev.id)!.size})
                        </Badge>
                      )}
                      <span className="font-medium">{ev.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {ev.time_tbd
                        ? `${formatDate(ev.starts_at)} – ⏳ Uhrzeit folgt`
                        : formatDateTime(ev.starts_at)}
                      {ev.ends_at
                        ? ` – ${formatUntil(ev.starts_at, ev.ends_at)}`
                        : ""}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </p>
                    {(ev.contact_ids?.length ?? 0) > 0 && (
                      <p className="text-sm text-muted">
                        👤 Ansprechpartner:{" "}
                        {(ev.contact_ids ?? [])
                          .map(
                            (id) =>
                              members.find((m) => m.id === id)?.full_name,
                          )
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    {(ev.source_uid ?? "").startsWith("comp-app:") ? (
                      <span className="text-sm text-muted">
                        wird in der Competition-App gepflegt
                      </span>
                    ) : (
                      <>
                        {feedEligible(ev) && (
                          <form action={toggleFeedExport}>
                            <input type="hidden" name="id" value={ev.id} />
                            <input
                              type="hidden"
                              name="next"
                              value={ev.feed_export === false ? "1" : "0"}
                            />
                            <button
                              className={`text-sm hover:underline ${
                                ev.feed_export === false
                                  ? "text-muted"
                                  : "text-ok"
                              }`}
                              title="Klicken zum Umschalten: Soll dieser Termin automatisch an die Competition-App übergeben werden?"
                            >
                              {ev.feed_export === false
                                ? "📵 nicht an Competition-App"
                                : "📤 an Competition-App"}
                            </button>
                          </form>
                        )}
                        <form action={deleteEvent}>
                          <input type="hidden" name="id" value={ev.id} />
                          <button className="text-sm text-danger hover:underline">
                            Löschen
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>

                {/* Bearbeiten (aufklappbar, vorausgefüllt); Schlüssel
                    wechselt nach dem Speichern → Feld klappt wieder zu.
                    Gespiegelte Competition-Abende sind hier nicht bearbeitbar. */}
                {!(ev.source_uid ?? "").startsWith("comp-app:") && (
                <details
                  key={`${ev.id}-${gespeichert ?? ""}`}
                  className="rounded-lg border border-border"
                >
                  <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
                    ✏️ Bearbeiten
                  </summary>
                  <form
                    action={updateEvent}
                    className="space-y-4 border-t border-border p-4"
                  >
                    <input type="hidden" name="id" value={ev.id} />
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Titel">
                        <input
                          name="title"
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
                          {Object.entries(EVENT_TYPE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>
                              {l}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Datum">
                        <input
                          name="starts_date"
                          type="date"
                          required
                          defaultValue={berlinISOToLocalInput(
                            ev.starts_at,
                          ).slice(0, 10)}
                          className={inputClass}
                        />
                      </Field>
                      <Field
                        label="Startzeit (optional)"
                        hint="Leer lassen = „Uhrzeit folgt“"
                      >
                        <input
                          name="starts_time"
                          type="time"
                          defaultValue={
                            berlinISOToLocalInput(ev.starts_at).slice(11) !==
                            "00:00"
                              ? berlinISOToLocalInput(ev.starts_at).slice(11)
                              : ""
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field
                        label="Ende – Datum (optional)"
                        hint="Für mehrtägige Termine"
                      >
                        <input
                          name="ends_date"
                          type="date"
                          defaultValue={
                            ev.ends_at
                              ? berlinISOToLocalInput(ev.ends_at).slice(0, 10)
                              : ""
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Ende – Uhrzeit (optional)">
                        <input
                          name="ends_time"
                          type="time"
                          defaultValue={
                            ev.ends_at &&
                            berlinISOToLocalInput(ev.ends_at).slice(11) !==
                              "00:00"
                              ? berlinISOToLocalInput(ev.ends_at).slice(11)
                              : ""
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Treffpunkt bei der TSG (optional)">
                        <input
                          name="meet_home_time"
                          type="time"
                          defaultValue={ev.meet_home_time ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Treffpunkt vor Ort (optional)">
                        <input
                          name="meet_venue_time"
                          type="time"
                          defaultValue={ev.meet_venue_time ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Mannschaft">
                        <select
                          name="team_id"
                          defaultValue={ev.team_id ?? ""}
                          className={inputClass}
                        >
                          <option value="">Gesamter Verein</option>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <OpponentFields
                        opponents={opponents}
                        defaults={{
                          opponent_id: ev.opponent_id,
                          opponent_team_no: ev.opponent_team_no,
                          home_away: ev.home_away,
                        }}
                      />
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
                      <Field label="Online-Link (optional)">
                        <input
                          name="meeting_url"
                          type="url"
                          defaultValue={ev.meeting_url ?? ""}
                          placeholder="https://teams.microsoft.com/…"
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <ContactPicker
                      members={members}
                      selected={new Set(ev.contact_ids ?? [])}
                    />
                    <InviteePicker
                      members={members}
                      selected={inviteesByEvent.get(ev.id)}
                    />
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
                      <span className="text-xs text-muted">
                        (wird automatisch gesetzt, wenn die Startzeit leer
                        bleibt)
                      </span>
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="feed_export"
                        defaultChecked={
                          ev.type === "training"
                            ? false
                            : (ev.feed_export ?? true)
                        }
                      />
                      📤 Automatisch an die Competition-App übergeben
                      <span className="text-xs text-muted">
                        (gilt nur für öffentliche Vereins- und Spieltermine)
                      </span>
                    </label>
                    <Button type="submit">Änderungen speichern</Button>
                  </form>
                </details>
                )}
              </CardBody>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
