import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import { getOrCreateJoinToken } from "@/lib/invites";
import { siteUrl } from "@/lib/supabase/config";
import { JoinLinkCard } from "./JoinLinkCard";
import { addInviteName, updateInvite, deleteInvite } from "./actions";
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

export const metadata: Metadata = { title: "Selbst-Anmeldung" };

type Invite = {
  id: string;
  full_name: string;
  role: string;
  team_ids: string[];
  birthday?: string | null;
  birthday_public?: boolean | null;
  birthday_congrats?: boolean | null;
  is_trainer?: boolean | null;
  claimed: boolean;
};

export default async function AdminBeitrittPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  const { fehler } = await searchParams;
  await requireAdmin();
  const teams = await getAllTeams();
  const token = await getOrCreateJoinToken();
  const joinUrl = `${siteUrl}/beitreten?token=${token}`;

  const supabase = await createClient();
  const { data, error: dbError } = await supabase
    .from("member_invites")
    .select("*")
    .order("claimed")
    .order("full_name");
  const invites = (data as Invite[]) ?? [];

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";
  const open = invites.filter((i) => !i.claimed);
  const done = invites.filter((i) => i.claimed);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Selbst-Anmeldung"
        subtitle="Namen anlegen, Link/QR verteilen – die Leute melden sich selbst an"
      />

      {dbError && (
        <Card className="border-danger/40 bg-danger/5">
          <CardBody className="space-y-1 text-sm">
            <p className="font-semibold text-danger">
              Die Datenbank-Erweiterung für die Selbst-Anmeldung fehlt oder ist
              unvollständig.
            </p>
            <p className="text-muted">
              Bitte im Supabase SQL-Editor das Skript{" "}
              <code>supabase/ALLE_ERWEITERUNGEN.sql</code> ausführen (kann
              gefahrlos mehrfach laufen). Technische Meldung: {dbError.message}
            </p>
          </CardBody>
        </Card>
      )}

      {fehler && (
        <Card className="border-danger/40 bg-danger/5">
          <CardBody className="text-sm text-danger">
            Name konnte nicht angelegt werden: {fehler}
          </CardBody>
        </Card>
      )}

      <JoinLinkCard url={joinUrl} />

      {/* Namen hinzufügen */}
      <Card>
        <CardBody>
          <form action={addInviteName} className="space-y-4">
            <h2 className="font-semibold">Namen für die Anmeldung anlegen</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input name="full_name" required className={inputClass} />
              </Field>
              <Field label="Rolle">
                <select name="role" defaultValue="player" className={inputClass}>
                  <option value="player">Spieler (Liga)</option>
                  <option value="member">Mitglied (ohne Liga)</option>
                  <option value="editor">Bearbeiter</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
            </div>
            <p className="text-xs text-muted">
              Die Mannschafts-Zuordnung läuft komplett über „Mannschaften
              verwalten“ bzw. die Saisonplanung.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Geburtstag (optional)"
                hint="Für die Liga-Meldung – falls schon bekannt"
              >
                <input name="birthday" type="date" className={inputClass} />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-sm">
                <input type="checkbox" name="birthday_public" />
                Im Mitglieder-Kalender anzeigen 🎂
                <span className="text-xs text-muted">
                  (entscheidet die Person bei der Registrierung selbst neu)
                </span>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="birthday_congrats" />
              In der Mitgliedergruppe gratulieren 🎉
              <span className="text-xs text-muted">
                (entscheidet die Person bei der Registrierung selbst neu)
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_trainer" />
              💪 Trainer – darf Trainings eintragen
            </label>
            <Button type="submit">Name hinzufügen</Button>
          </form>
        </CardBody>
      </Card>

      {/* Offene Namen */}
      <section>
        <h2 className="mb-3 text-lg font-bold">
          Offen – warten auf Anmeldung{" "}
          <span className="text-sm font-normal text-muted">({open.length})</span>
        </h2>
        {open.length === 0 ? (
          <EmptyState
            title="Keine offenen Namen"
            hint="Füge oben die Namen deiner Mitglieder hinzu."
          />
        ) : (
          <div className="space-y-2">
            {open.map((inv) => (
              <Card key={inv.id}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className="font-medium">{inv.full_name}</span>
                      {inv.role === "admin" && (
                        <Badge tone="primary">Admin</Badge>
                      )}
                      {inv.role === "editor" && (
                        <Badge tone="primary">Bearbeiter</Badge>
                      )}
                      {inv.role === "member" && <Badge>ohne Liga</Badge>}
                      {inv.is_trainer && <Badge tone="ok">💪 Trainer</Badge>}
                      {inv.team_ids?.length > 0 && (
                        <span className="ml-2 text-sm text-muted">
                          {inv.team_ids.map(teamName).filter(Boolean).join(", ")}
                        </span>
                      )}
                      {inv.birthday ? (
                        <span className="ml-2 text-sm text-muted">
                          🎂 {inv.birthday}
                        </span>
                      ) : (
                        <span className="ml-2 text-sm text-warn">
                          Geburtstag fehlt
                        </span>
                      )}
                    </div>
                    <form action={deleteInvite}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button className="text-sm text-danger hover:underline">
                        Entfernen
                      </button>
                    </form>
                  </div>

                  {/* Bearbeiten */}
                  <details className="rounded-lg border border-border">
                    <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
                      ✏️ Bearbeiten
                    </summary>
                    <form
                      action={updateInvite}
                      className="space-y-4 border-t border-border p-4"
                    >
                      <input type="hidden" name="id" value={inv.id} />
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Name">
                          <input
                            name="full_name"
                            required
                            defaultValue={inv.full_name}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Rolle">
                          <select
                            name="role"
                            defaultValue={inv.role}
                            className={inputClass}
                          >
                            <option value="player">Spieler (Liga)</option>
                            <option value="member">Mitglied (ohne Liga)</option>
                            <option value="editor">Bearbeiter</option>
                            <option value="admin">Admin</option>
                          </select>
                        </Field>
                      </div>
                      <p className="text-xs text-muted">
                        Die Mannschafts-Zuordnung läuft komplett über
                        „Mannschaften verwalten“ bzw. die Saisonplanung.
                      </p>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Geburtstag" hint="Für die Liga-Meldung">
                          <input
                            name="birthday"
                            type="date"
                            defaultValue={inv.birthday ?? ""}
                            className={inputClass}
                          />
                        </Field>
                        <label className="flex items-center gap-2 self-end pb-2 text-sm">
                          <input
                            type="checkbox"
                            name="birthday_public"
                            defaultChecked={inv.birthday_public ?? false}
                          />
                          Im Mitglieder-Kalender anzeigen 🎂
                        </label>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="birthday_congrats"
                          defaultChecked={inv.birthday_congrats ?? false}
                        />
                        In der Mitgliedergruppe gratulieren 🎉
                        <span className="text-xs text-muted">
                          (entscheidet die Person bei der Registrierung selbst
                          neu)
                        </span>
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="is_trainer"
                          defaultChecked={inv.is_trainer ?? false}
                        />
                        💪 Trainer – darf Trainings eintragen
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

      {/* Bereits beigetreten */}
      {done.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-muted">
            Bereits angemeldet{" "}
            <span className="text-sm font-normal">({done.length})</span>
          </h2>
          <div className="space-y-2 opacity-70">
            {done.map((inv) => (
              <Card key={inv.id}>
                <CardBody className="flex items-center justify-between gap-3">
                  <span>{inv.full_name}</span>
                  <Badge tone="ok">beigetreten</Badge>
                </CardBody>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
