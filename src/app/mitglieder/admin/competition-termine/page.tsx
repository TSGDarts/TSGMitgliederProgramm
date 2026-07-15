import type { Metadata } from "next";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createCompetitionDate,
  updateCompetitionDate,
  deleteCompetitionDate,
} from "./actions";
import { Einklappbar } from "@/components/Einklappbar";
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
import { formatDate } from "@/lib/format";
import type { CompetitionDate } from "@/lib/extras";

export const metadata: Metadata = { title: "Competition-Termine" };

/** Gemeinsame Formularfelder für Anlegen UND Bearbeiten (vorausgefüllt). */
function DateFields({ defaults }: { defaults?: CompetitionDate }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Datum">
        <input
          name="date"
          type="date"
          required
          defaultValue={defaults?.date ?? ""}
          className={inputClass}
        />
      </Field>
      <Field
        label="Nr. (optional)"
        hint="Leer lassen = die Competition-App nummeriert automatisch"
      >
        <input
          name="nr"
          type="number"
          min={1}
          defaultValue={defaults?.nr ?? ""}
          className={inputClass}
        />
      </Field>
      <Field
        label="3K-Event-Link (optional)"
        hint="Link zur Teilnehmerliste/Anmeldung in der 3K-Dart-Software"
      >
        <input
          name="event_url"
          type="url"
          placeholder="https://www.2k-dart-software.com/…"
          defaultValue={defaults?.event_url ?? ""}
          className={inputClass}
        />
      </Field>
      <Field label="Boards (optional)" hint="Anzahl der Dartboards an dem Abend">
        <input
          name="boards"
          type="number"
          min={1}
          defaultValue={defaults?.boards ?? ""}
          className={inputClass}
        />
      </Field>
    </div>
  );
}

export default async function CompetitionDatesPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; gespeichert?: string }>;
}) {
  await requireEditor();
  const { fehler, gespeichert } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from("competition_dates")
    .select("*")
    .order("date", { ascending: true });
  const dates = (data as CompetitionDate[]) ?? [];

  const heute = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const kommende = dates.filter((d) => d.date >= heute);
  const vergangene = dates.filter((d) => d.date < heute).reverse();

  const eintrag = (d: CompetitionDate, vorbei: boolean) => (
    <Card key={d.id} className={vorbei ? "opacity-70" : ""}>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">🎯 {formatDate(d.date)}</span>
            <Badge tone="primary">
              {d.nr != null ? `Competition ${d.nr}` : "Nr. automatisch"}
            </Badge>
            {d.boards != null && <Badge>🎯 {d.boards} Boards</Badge>}
            {d.event_url && (
              <a
                href={d.event_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-primary hover:underline"
              >
                🔗 3K-Event
              </a>
            )}
          </div>
          <form action={deleteCompetitionDate}>
            <input type="hidden" name="id" value={d.id} />
            <button className="text-sm text-danger hover:underline">
              Löschen
            </button>
          </form>
        </div>

        {/* Bearbeiten (aufklappbar, vorausgefüllt); Schlüssel wechselt
            nach dem Speichern → Feld klappt wieder zu */}
        <details
          key={`${d.id}-${gespeichert ?? ""}`}
          className="rounded-lg border border-border"
        >
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
            ✏️ Bearbeiten
          </summary>
          <form
            action={updateCompetitionDate}
            className="space-y-4 border-t border-border p-4"
          >
            <input type="hidden" name="id" value={d.id} />
            <DateFields defaults={d} />
            <Button type="submit">Änderungen speichern</Button>
          </form>
        </details>
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competition-Termine"
        subtitle="Unsere Montags-Competitions – wandern automatisch in die Competition-App (Dart-Feed) und als 🎯-Termine in den Kalender"
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

      <Einklappbar id="comp-termin-anlegen" title="➕ Competition-Termin anlegen">
        {/* Schlüssel wechselt nach dem Speichern → Formular wird geleert */}
        <form
          key={gespeichert ?? "neu"}
          action={createCompetitionDate}
          className="space-y-4"
        >
          <DateFields />
          <Button type="submit">Termin anlegen</Button>
        </form>
      </Einklappbar>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Kommende Competition-Abende</h2>
        {kommende.length === 0 ? (
          <EmptyState
            title="Keine kommenden Competition-Termine"
            hint="Oben einen neuen Termin anlegen – er erscheint automatisch in der Competition-App und im Kalender."
          />
        ) : (
          kommende.map((d) => eintrag(d, false))
        )}
      </section>

      {vergangene.length > 0 && (
        <Einklappbar
          id="comp-termine-vergangen"
          title={`Vergangene Competition-Abende (${vergangene.length})`}
          defaultOpen={false}
        >
          <div className="space-y-3">
            {vergangene.map((d) => eintrag(d, true))}
          </div>
        </Einklappbar>
      )}
    </div>
  );
}
