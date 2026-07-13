import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import { createEvent, updateEvent, deleteEvent } from "./actions";
import { berlinISOToLocalInput } from "@/lib/tz";
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
import { EVENT_TYPE_LABELS, type EventRow } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Termine verwalten" };

export default async function AdminEventsPage() {
  await requireAdmin();
  const teams = await getAllTeams();
  const supabase = await createClient();

  const { data } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", new Date(Date.now() - 7 * 864e5).toISOString())
    .order("starts_at", { ascending: true });
  const events = (data as EventRow[]) ?? [];
  const teamName = (id: string | null) =>
    id ? teams.find((t) => t.id === id)?.name : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Termine verwalten"
        subtitle="Termine für den Verein oder einzelne Mannschaften anlegen"
      />

      <Card>
        <CardBody>
          <form action={createEvent} className="space-y-4">
            <h2 className="font-semibold">Neuer Termin</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Titel">
                <input name="title" required className={inputClass} />
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
              <Field label="Datum & Uhrzeit">
                <input
                  name="starts_at"
                  type="datetime-local"
                  required
                  className={inputClass}
                />
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
              <Field label="Ort (optional)">
                <input name="location" className={inputClass} />
              </Field>
              <Field label="Beschreibung (optional)">
                <input name="description" className={inputClass} />
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
                      {!ev.is_public && <Badge tone="warn">intern</Badge>}
                      <span className="font-medium">{ev.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {formatDateTime(ev.starts_at)}
                      {ev.location ? ` · ${ev.location}` : ""}
                    </p>
                  </div>
                  <form action={deleteEvent}>
                    <input type="hidden" name="id" value={ev.id} />
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
                    action={updateEvent}
                    className="space-y-4 border-t border-border p-4"
                  >
                    <input type="hidden" name="id" value={ev.id} />
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
                          defaultValue={berlinISOToLocalInput(ev.starts_at)}
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
          ))
        )}
      </section>
    </div>
  );
}
