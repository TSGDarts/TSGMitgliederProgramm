import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createOpponent,
  updateOpponent,
  deleteOpponent,
  saveHomeAddress,
} from "./actions";
import { AddressLine } from "@/components/AddressLine";
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

export default async function AdminOpponentsPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: oppData } = await supabase
    .from("opponents")
    .select("*")
    .order("name");
  const opponents = (oppData as Opponent[]) ?? [];

  const { data: homeData } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "home_address")
    .maybeSingle();
  const homeAddress = (homeData?.value as string) ?? "";

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
          <form action={saveHomeAddress} className="flex flex-wrap gap-2">
            <input
              name="address"
              defaultValue={homeAddress}
              placeholder="z. B. Ostring 28, 91154 Roth"
              className={`${inputClass} max-w-md flex-1`}
            />
            <Button type="submit" variant="secondary">
              Speichern
            </Button>
          </form>
          {homeAddress && <AddressLine address={homeAddress} className="text-sm" />}
        </CardBody>
      </Card>

      {/* Neuer Gegner */}
      <Card>
        <CardBody>
          <form action={createOpponent} className="space-y-4">
            <h2 className="font-semibold">Neuer Gegner</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vereinsname" hint="z. B. DC Schwabach – die Mannschafts-Nr. (I, II, …) wählst du beim Termin">
                <input name="name" required className={inputClass} />
              </Field>
              <Field label="Adresse (Spielstätte)">
                <input
                  name="address"
                  placeholder="Straße Nr., PLZ Ort"
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Notiz (optional)" hint="z. B. Parken hinterm Haus, Eingang über den Hof …">
              <input name="notes" className={inputClass} />
            </Field>
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
                      <p className="text-sm text-muted">Keine Adresse hinterlegt</p>
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
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Vereinsname">
                        <input
                          name="name"
                          required
                          defaultValue={o.name}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Adresse">
                        <input
                          name="address"
                          defaultValue={o.address}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <Field label="Notiz (optional)">
                      <input
                        name="notes"
                        defaultValue={o.notes}
                        className={inputClass}
                      />
                    </Field>
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
