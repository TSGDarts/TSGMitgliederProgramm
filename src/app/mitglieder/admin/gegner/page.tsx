import type { Metadata } from "next";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createOpponent,
  updateOpponent,
  deleteOpponent,
  saveHomeAddress,
  saveGegnerVorlage,
} from "./actions";
import { getGegnerVorlage } from "@/lib/settings";
import { AddressLine } from "@/components/AddressLine";
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
import type { Opponent } from "@/lib/types";

export const metadata: Metadata = { title: "Gegner verwalten" };

/** Straße / PLZ / Ort nebeneinander. */
function AddressFields({
  defaults,
}: {
  defaults?: { street?: string | null; zip?: string | null; city?: string | null };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      <div className="sm:col-span-2">
        <Field label="Straße & Hausnummer">
          <input
            name="street"
            defaultValue={defaults?.street ?? ""}
            placeholder="Ostring 28"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="PLZ">
        <input
          name="zip"
          defaultValue={defaults?.zip ?? ""}
          placeholder="91154"
          inputMode="numeric"
          className={inputClass}
        />
      </Field>
      <Field label="Ort">
        <input
          name="city"
          defaultValue={defaults?.city ?? ""}
          placeholder="Roth"
          className={inputClass}
        />
      </Field>
    </div>
  );
}

export default async function AdminOpponentsPage() {
  await requireEditor();
  const supabase = await createClient();

  const { data: oppData } = await supabase
    .from("opponents")
    .select("*")
    .order("name");
  const opponents = (oppData as Opponent[]) ?? [];

  // Heimspielstätte (getrennte Felder + zusammengesetzte Adresse)
  const { data: settingsData } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["home_street", "home_zip", "home_city", "home_address"]);
  const settings = new Map(
    (settingsData ?? []).map((s) => [s.key as string, s.value as string]),
  );
  const homeAddress = settings.get("home_address") ?? "";
  const gegnerVorlage = await getGegnerVorlage();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gegner verwalten"
        subtitle="Gegnervereine mit Adresse einmalig hinterlegen – Termine wählen dann nur noch Gegner + Mannschafts-Nr."
      />

      {/* Eigene Heimspielstätte */}
      <Card className="bg-primary/5">
        <CardBody className="space-y-3">
          <div>
            <h2 className="font-semibold">🏠 Unsere Heimspielstätte</h2>
            <p className="text-sm text-muted">
              Diese Adresse wird bei Heim-Terminen automatisch als Ort
              eingetragen.
            </p>
          </div>
          <form action={saveHomeAddress} className="space-y-3">
            <AddressFields
              defaults={{
                street: settings.get("home_street") ?? "",
                zip: settings.get("home_zip") ?? "",
                city: settings.get("home_city") ?? "",
              }}
            />
            <Button type="submit" variant="secondary">
              Speichern
            </Button>
          </form>
          {homeAddress && (
            <AddressLine address={homeAddress} className="text-sm" />
          )}
        </CardBody>
      </Card>

      {/* Vorlage für die Heimspiel-Nachricht */}
      <Einklappbar
        id="gegner-vorlage"
        title="💬 Heimspiel-Nachricht an den Gegner (Vorlage)"
        defaultOpen={false}
      >
        <p className="mb-2 text-sm text-muted">
          Diese Vorlage steht den Kapitänen bei jedem Heimspiel-Termin fertig
          ausgefüllt bereit (Kopieren/WhatsApp). Platzhalter werden
          automatisch ersetzt:{" "}
          <code className="text-xs">{"{ansprechpartner}"}</code>,{" "}
          <code className="text-xs">{"{kapitaen}"}</code>,{" "}
          <code className="text-xs">{"{mannschaft}"}</code>,{" "}
          <code className="text-xs">{"{datum}"}</code>,{" "}
          <code className="text-xs">{"{uhrzeit}"}</code>.
        </p>
        <form action={saveGegnerVorlage} className="space-y-3">
          <textarea
            name="vorlage"
            rows={16}
            defaultValue={gegnerVorlage}
            className={`${inputClass} font-mono text-xs`}
          />
          <Button type="submit">Vorlage speichern</Button>
        </form>
      </Einklappbar>

      {/* Neuer Gegner */}
      <Card>
        <CardBody>
          <form action={createOpponent} className="space-y-4">
            <h2 className="font-semibold">Neuer Gegner</h2>
            <Field
              label="Vereinsname"
              hint="z. B. DC Schwabach – die Mannschafts-Nr. wählst du beim Termin"
            >
              <input name="name" required className={inputClass} />
            </Field>
            <AddressFields />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Ansprechpartner (optional)"
                hint="Für die Heimspiel-Nachricht"
              >
                <input name="contact_name" className={inputClass} />
              </Field>
              <Field label="Anzahl Boards (optional)" hint="Falls bekannt">
                <input
                  name="boards"
                  type="number"
                  min={1}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Notiz (optional)"
                hint="z. B. Parken hinterm Haus, Eingang über den Hof …"
              >
                <input name="notes" className={inputClass} />
              </Field>
            </div>
            <Button type="submit">Gegner anlegen</Button>
          </form>
        </CardBody>
      </Card>

      {/* Liste */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          Gegner{" "}
          <span className="text-sm font-normal text-muted">
            ({opponents.length})
          </span>
        </h2>
        {opponents.length === 0 ? (
          <EmptyState
            title="Noch keine Gegner angelegt"
            hint="Lege oben die Gegnervereine mit ihren Adressen an."
          />
        ) : (
          opponents.map((o) => (
            <Card key={o.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{o.name}</p>
                    {o.address ? (
                      <AddressLine address={o.address} className="text-sm" />
                    ) : (
                      <p className="text-sm text-muted">
                        Keine Adresse hinterlegt
                      </p>
                    )}
                    {o.boards && (
                      <p className="mt-1 text-sm text-muted">
                        🎯 {o.boards} Boards
                      </p>
                    )}
                    {o.contact_name && (
                      <p className="mt-1 text-sm text-muted">
                        👤 Ansprechpartner: {o.contact_name}
                      </p>
                    )}
                    {o.notes && (
                      <p className="mt-1 text-sm text-muted">💡 {o.notes}</p>
                    )}
                  </div>
                  <form action={deleteOpponent}>
                    <input type="hidden" name="id" value={o.id} />
                    <button className="text-sm text-danger hover:underline">
                      Löschen
                    </button>
                  </form>
                </div>

                <details className="rounded-lg border border-border">
                  <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
                    ✏️ Bearbeiten
                  </summary>
                  <form
                    action={updateOpponent}
                    className="space-y-4 border-t border-border p-4"
                  >
                    <input type="hidden" name="id" value={o.id} />
                    <Field label="Vereinsname">
                      <input
                        name="name"
                        required
                        defaultValue={o.name}
                        className={inputClass}
                      />
                    </Field>
                    <AddressFields
                      defaults={{
                        street: o.street ?? "",
                        zip: o.zip ?? "",
                        city: o.city ?? "",
                      }}
                    />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Ansprechpartner (optional)">
                        <input
                          name="contact_name"
                          defaultValue={o.contact_name ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Anzahl Boards (optional)">
                        <input
                          name="boards"
                          type="number"
                          min={1}
                          defaultValue={o.boards ?? ""}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Notiz (optional)">
                        <input
                          name="notes"
                          defaultValue={o.notes}
                          className={inputClass}
                        />
                      </Field>
                    </div>
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
