import type { Metadata } from "next";
import { requireProfile, canManageTrainings } from "@/lib/auth";
import { getMemberEvents, getAllTeams } from "@/lib/member-queries";
import { createTraining, updateTraining, deleteTraining } from "./actions";
import { EventCard } from "@/components/EventCard";
import { Einklappbar } from "@/components/Einklappbar";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  inputClass,
  EmptyState,
} from "@/components/ui";
import { berlinISOToLocalInput } from "@/lib/tz";
import type { Team } from "@/lib/types";
import type { EventWithStatus } from "@/lib/member-queries";

export const metadata: Metadata = { title: "Training" };

/** Gemeinsame Formularfelder für Anlegen UND Bearbeiten (vorausgefüllt). */
function TrainingFields({
  teams,
  defaults,
}: {
  teams: Team[];
  defaults?: EventWithStatus;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titel">
          <input
            name="title"
            defaultValue={defaults?.title ?? "Training"}
            className={inputClass}
          />
        </Field>
        <Field label="Mannschaft">
          <select
            name="team_id"
            defaultValue={defaults?.team_id ?? ""}
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
        <Field label="Datum & Startzeit">
          <input
            name="starts_at"
            type="datetime-local"
            required
            defaultValue={
              defaults ? berlinISOToLocalInput(defaults.starts_at) : undefined
            }
            className={inputClass}
          />
        </Field>
        <Field label="Ende (optional)">
          <input
            name="ends_at"
            type="datetime-local"
            defaultValue={
              defaults?.ends_at
                ? berlinISOToLocalInput(defaults.ends_at)
                : undefined
            }
            className={inputClass}
          />
        </Field>
        <Field label="Ort (optional)">
          <input
            name="location"
            defaultValue={defaults?.location ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Beschreibung (optional)">
          <input
            name="description"
            defaultValue={defaults?.description ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="is_public"
          defaultChecked={defaults ? defaults.is_public : true}
        />
        Im Kalender-Abo (öffentlicher Kalender) anzeigen
      </label>
    </>
  );
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; gespeichert?: string }>;
}) {
  const { fehler, gespeichert } = await searchParams;
  const profile = await requireProfile();
  const darfPflegen = canManageTrainings(profile);
  const teams = await getAllTeams();

  const [upcomingAll, pastAll] = await Promise.all([
    getMemberEvents(profile.id),
    getMemberEvents(profile.id, { past: true }),
  ]);
  const upcoming = upcomingAll.filter((e) => e.type === "training");
  const past = pastAll.filter((e) => e.type === "training");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        subtitle="Trainingstermine mit Zu-/Absage – eingetragen von den Trainern"
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

      {darfPflegen && (
        <Einklappbar
          id="training-anlegen"
          title="➕ Training eintragen"
          defaultOpen={false}
        >
          {/* Schlüssel wechselt nach dem Speichern → Formular wird geleert */}
          <form
            key={gespeichert ?? "neu"}
            action={createTraining}
            className="space-y-4"
          >
            <TrainingFields teams={teams} />
            <Button type="submit">Training eintragen</Button>
          </form>
        </Einklappbar>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Anstehende Trainings</h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Kein Training geplant"
            hint={
              darfPflegen
                ? "Oben ein Training eintragen – es erscheint im Kalender und alle können zu-/absagen."
                : "Sobald ein Trainer ein Training einträgt, erscheint es hier mit Zu-/Absage."
            }
          />
        ) : (
          upcoming.map((event) => (
            <div key={event.id} className="space-y-2">
              <EventCard event={event} />
              {darfPflegen && (
                <div className="flex items-center justify-end gap-3 px-1">
                  <form action={deleteTraining}>
                    <input type="hidden" name="id" value={event.id} />
                    <button className="text-sm text-danger hover:underline">
                      Löschen
                    </button>
                  </form>
                </div>
              )}
              {darfPflegen && (
                <details
                  key={`${event.id}-${gespeichert ?? ""}`}
                  className="rounded-lg border border-border"
                >
                  <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
                    ✏️ Bearbeiten
                  </summary>
                  <form
                    action={updateTraining}
                    className="space-y-4 border-t border-border p-4"
                  >
                    <input type="hidden" name="id" value={event.id} />
                    <TrainingFields teams={teams} defaults={event} />
                    <Button type="submit">Änderungen speichern</Button>
                  </form>
                </details>
              )}
            </div>
          ))
        )}
      </section>

      {past.length > 0 && (
        <Einklappbar
          id="training-vergangen"
          title={`Vergangene Trainings (${past.length})`}
          defaultOpen={false}
        >
          <div className="space-y-3 opacity-70">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </Einklappbar>
      )}
    </div>
  );
}
