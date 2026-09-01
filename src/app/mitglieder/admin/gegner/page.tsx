import type { Metadata } from "next";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createOpponent,
  updateOpponent,
  deleteOpponent,
  createOpponentTeamContact,
  updateOpponentTeamContact,
  deleteOpponentTeamContact,
  saveHomeAddress,
  saveGegnerVorlage,
} from "./actions";
import { getGegnerVorlage } from "@/lib/settings";
import { OPPONENT_BACKFILL_SETTING } from "@/lib/nuliga-opponent-sync";
import { AddressLine } from "@/components/AddressLine";
import { romanTeamNo } from "@/lib/extras";
import type { OpponentTeamContact } from "@/lib/opponent-contacts";
import { Einklappbar } from "@/components/Einklappbar";
import { OpponentBackfill } from "./OpponentBackfill";
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

function OpponentContactFields({
  contact,
}: {
  contact?: OpponentTeamContact;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <Field label="Mannschaft Nr.">
        <input
          name="team_no"
          type="number"
          min={1}
          max={99}
          required
          defaultValue={contact?.team_no ?? 1}
          className={inputClass}
        />
      </Field>
      <div className="lg:col-span-2">
        <Field label="Name">
          <input
            name="contact_name"
            required
            defaultValue={contact?.name ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Telefon / Mobil">
        <input
          name="phone"
          type="tel"
          defaultValue={contact?.phone ?? ""}
          className={inputClass}
        />
      </Field>
      <div className="lg:col-span-2">
        <Field label="E-Mail">
          <input
            name="email"
            type="email"
            defaultValue={contact?.email ?? ""}
            className={inputClass}
          />
        </Field>
      </div>
      <div className="sm:col-span-2 lg:col-span-6">
        <Field label="Öffentliche NuLiga-Quelle">
          <input
            name="source_url"
            type="url"
            defaultValue={contact?.source_url ?? ""}
            placeholder="https://bdv-dart.liga.nu/…"
            className={inputClass}
          />
        </Field>
      </div>
    </div>
  );
}

export default async function AdminOpponentsPage() {
  await requireEditor();
  const supabase = await createClient();

  const [{ data: oppData }, { data: contactData }] = await Promise.all([
    supabase.from("opponents").select("*").order("name"),
    supabase
      .from("opponent_team_contacts")
      .select("*")
      .order("team_no"),
  ]);
  const opponents = (oppData as Opponent[]) ?? [];
  const contactsByOpponent = new Map<string, OpponentTeamContact[]>();
  for (const contact of (contactData as OpponentTeamContact[] | null) ?? []) {
    const current = contactsByOpponent.get(contact.opponent_id) ?? [];
    current.push(contact);
    contactsByOpponent.set(contact.opponent_id, current);
  }

  // Heimspielstätte (getrennte Felder + zusammengesetzte Adresse)
  const { data: settingsData } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", [
      "home_street",
      "home_zip",
      "home_city",
      "home_address",
      OPPONENT_BACKFILL_SETTING,
    ]);
  const settings = new Map(
    (settingsData ?? []).map((s) => [s.key as string, s.value as string]),
  );
  const backfillCompleted = Boolean(settings.get(OPPONENT_BACKFILL_SETTING));
  const { count: missingOpponentLinks } = await supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("source", "nuliga")
    .is("opponent_id", null);
  const homeAddress = settings.get("home_address") ?? "";
  const gegnerVorlage = await getGegnerVorlage();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Gegner verwalten"
        subtitle="Gegner aus nuLiga-Spieltagen werden automatisch übernommen. Ansprechpartner pflegst du hier getrennt nach Mannschaft – mit Telefon, E-Mail und NuLiga-Quelle."
      />

      <OpponentBackfill
        remainingCount={missingOpponentLinks ?? 0}
        shouldRun={!backfillCompleted}
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
          <code className="text-xs">{"{uhrzeit}"}</code>. Zusätzlich gibt es{" "}
          <code className="text-xs">{"{spiellink}"}</code> für den 2k-Link
          des Spiels (pflegt der Kapitän auf der Terminseite) – steht der
          Platzhalter nicht in der Vorlage, wird der Link automatisch am
          Ende der Nachricht ergänzt; ohne hinterlegten Link entfällt die
          Zeile.
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
            <h2 className="font-semibold">Gegner manuell ergänzen</h2>
            <Field
              label="Vereinsname"
              hint="z. B. DC Schwabach – die Mannschafts-Nr. wählst du beim Termin"
            >
              <input name="name" required className={inputClass} />
            </Field>
            <AddressFields />
            <div className="grid gap-4 sm:grid-cols-2">
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
            hint="Vorhandene nuLiga-Spieltage werden automatisch ausgewertet. Weitere Gegner kannst du oben manuell anlegen."
          />
        ) : (
          opponents.map((o) => {
            const teamContacts = contactsByOpponent.get(o.id) ?? [];
            return (
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
                    {teamContacts.length === 0 && o.contact_name && (
                      <p className="mt-1 text-sm text-muted">
                        👤 Allgemeiner Ansprechpartner: {o.contact_name}
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

                {teamContacts.length > 0 && (
                  <div className="space-y-2 rounded-lg bg-primary/5 p-3">
                    <p className="text-sm font-semibold">
                      👤 Mannschaftsansprechpartner
                    </p>
                    {teamContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                      >
                        <span className="font-medium">
                          Mannschaft {romanTeamNo(contact.team_no) || "I"}
                        </span>
                        <span>{contact.name}</span>
                        {contact.phone && (
                          <a
                            href={`tel:${contact.phone}`}
                            className="text-primary hover:underline"
                          >
                            {contact.phone}
                          </a>
                        )}
                        {contact.email && (
                          <a
                            href={`mailto:${contact.email}`}
                            className="text-primary hover:underline"
                          >
                            {contact.email}
                          </a>
                        )}
                        {contact.source_url && (
                          <a
                            href={contact.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary hover:underline"
                          >
                            NuLiga ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}

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
                    <div className="grid gap-4 sm:grid-cols-2">
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

                  <div className="space-y-4 border-t border-border p-4">
                    <div>
                      <p className="font-medium">
                        Ansprechpartner nach Mannschaft
                      </p>
                      <p className="text-xs text-muted">
                        Diese Zuordnung wählt beim Heimspiel automatisch den
                        richtigen WhatsApp-Empfänger.
                      </p>
                    </div>

                    {teamContacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="space-y-3 rounded-lg border border-border p-3"
                      >
                        <form
                          action={updateOpponentTeamContact}
                          className="space-y-3"
                        >
                          <input
                            type="hidden"
                            name="contact_id"
                            value={contact.id}
                          />
                          <OpponentContactFields contact={contact} />
                          <Button type="submit" variant="secondary">
                            Ansprechpartner speichern
                          </Button>
                        </form>
                        <form action={deleteOpponentTeamContact}>
                          <input
                            type="hidden"
                            name="contact_id"
                            value={contact.id}
                          />
                          <button className="text-sm text-danger hover:underline">
                            Ansprechpartner entfernen
                          </button>
                        </form>
                      </div>
                    ))}

                    <form
                      action={createOpponentTeamContact}
                      className="space-y-3 rounded-lg border border-dashed border-border p-3"
                    >
                      <input
                        type="hidden"
                        name="opponent_id"
                        value={o.id}
                      />
                      <p className="text-sm font-medium">
                        + Ansprechpartner ergänzen
                      </p>
                      <OpponentContactFields />
                      <Button type="submit" variant="secondary">
                        Ansprechpartner hinzufügen
                      </Button>
                    </form>
                  </div>
                </details>
              </CardBody>
            </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
