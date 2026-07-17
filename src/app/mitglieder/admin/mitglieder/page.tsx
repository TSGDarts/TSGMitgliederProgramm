import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { CreateMemberForm } from "./CreateMemberForm";
import { RegenerateLink } from "./RegenerateLink";
import { MemberActionButtons } from "./MemberActionButtons";
import { setMemberRole, updateMemberData } from "./actions";
import {
  deleteInvite,
  updateInvite,
  reaktiviereInvite,
} from "../beitritt/actions";
import { istAusgetreten } from "@/lib/invites";
import {
  PageHeader,
  Card,
  CardBody,
  Badge,
  Button,
  Field,
  inputClass,
} from "@/components/ui";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Mitglieder verwalten" };

export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; gespeichert?: string }>;
}) {
  const { fehler, gespeichert } = await searchParams;
  const me = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");
  const members = (data as Profile[]) ?? [];
  const aktive = members.filter((m) => m.is_active);
  const ehemalige = members.filter((m) => !m.is_active);

  // Vorab angelegte Namen, die noch auf die Selbst-Anmeldung warten
  const { data: invitesData } = await supabase
    .from("member_invites")
    .select("*")
    .eq("claimed", false)
    .order("full_name");
  const openInvites = (invitesData ?? []) as Array<{
    id: string;
    full_name: string;
    role: string;
    team_ids: string[];
    birthday?: string | null;
    birthday_public?: boolean | null;
    birthday_congrats?: boolean | null;
    is_trainer?: boolean | null;
    is_planner?: boolean | null;
    left_on?: string | null;
  }>;
  const wartende = openInvites.filter((i) => !istAusgetreten(i.left_on));
  const ausgetreteneNamen = openInvites.filter((i) =>
    istAusgetreten(i.left_on),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mitglieder verwalten"
        subtitle="Zugänge anlegen, Rollen vergeben, Passwort-Links erzeugen"
      />

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody>
            <p className="font-semibold text-danger">⚠️ Fehler beim Speichern</p>
            <p className="mt-1 text-sm">{fehler}</p>
          </CardBody>
        </Card>
      ) : null}

      {gespeichert ? (
        <Card className="border-ok/40 bg-ok/10">
          <CardBody className="font-semibold text-ok">✓ Gespeichert.</CardBody>
        </Card>
      ) : null}

      <CreateMemberForm />

      {wartende.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">
            Angelegt – warten auf Selbst-Anmeldung{" "}
            <span className="text-sm font-normal text-muted">
              ({wartende.length})
            </span>
          </h2>
          <div className="space-y-2">
            {wartende.map((inv) => (
              <Card key={inv.id} className="border-dashed">
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{inv.full_name}</span>
                      {inv.role === "admin" && (
                        <Badge tone="primary">Admin</Badge>
                      )}
                      {inv.role === "editor" && (
                        <Badge tone="primary">Bearbeiter</Badge>
                      )}
                      {inv.role === "member" && <Badge>ohne Liga</Badge>}
                      {inv.is_trainer && <Badge tone="ok">💪 Trainer</Badge>}
                      {inv.is_planner && <Badge tone="ok">🧠 Saisonplaner</Badge>}
                      <Badge tone="warn">noch nicht angemeldet</Badge>
                      {inv.left_on && (
                        <Badge tone="warn">👋 Austritt zum {inv.left_on}</Badge>
                      )}
                      {inv.birthday ? (
                        <span className="text-sm text-muted">
                          🎂 {inv.birthday}
                        </span>
                      ) : (
                        <span className="text-sm text-warn">
                          Geburtstag fehlt (für Liga nötig)
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
                      <div className="grid gap-4 sm:grid-cols-3">
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
                        <Field label="Geburtstag" hint="Für die Liga-Meldung">
                          <input
                            name="birthday"
                            type="date"
                            defaultValue={inv.birthday ?? ""}
                            className={inputClass}
                          />
                        </Field>
                        <Field
                          label="Austritt zum (optional)"
                          hint="Ab diesem Tag nicht mehr wählbar/planbar – wandert zu „Ehemalige Mitglieder“"
                        >
                          <input
                            name="left_on"
                            type="date"
                            defaultValue={inv.left_on ?? ""}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <p className="text-xs text-muted">
                        Die Mannschafts-Zuordnung läuft komplett über
                        „Mannschaften verwalten“ bzw. die Saisonplanung.
                      </p>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="birthday_public"
                          defaultChecked={inv.birthday_public ?? false}
                        />
                        Geburtstag im Mitglieder-Kalender anzeigen 🎂
                        <span className="text-xs text-muted">
                          (entscheidet die Person bei der Registrierung selbst
                          neu)
                        </span>
                      </label>
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
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="is_planner"
                          defaultChecked={inv.is_planner ?? false}
                        />
                        🧠 Saisonplaner – darf eigene Planungs-Entwürfe pflegen
                      </label>
                      <Button type="submit">Änderungen speichern</Button>
                    </form>
                  </details>
                </CardBody>
              </Card>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted">
            Diese Namen wurden über die{" "}
            <Link
              href="/mitglieder/admin/beitritt"
              className="text-primary hover:underline"
            >
              Selbst-Anmeldung
            </Link>{" "}
            angelegt. Sobald sich die Person über den Beitritts-Link anmeldet,
            erscheint sie unten bei den Mitgliedern.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">
          Mitglieder{" "}
          <span className="text-sm font-normal text-muted">
            ({aktive.length})
          </span>
        </h2>
        <div className="space-y-3">
          {aktive.map((m) => (
            <Card key={m.id}>
              <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {m.full_name || "(ohne Namen)"}
                    </span>
                    {m.role === "admin" && <Badge tone="primary">Admin</Badge>}
                    {m.role === "editor" && (
                      <Badge tone="primary">Bearbeiter</Badge>
                    )}
                    {m.role === "member" && <Badge>ohne Liga</Badge>}
                    {m.is_trainer && <Badge tone="ok">💪 Trainer</Badge>}
                    {m.is_planner && <Badge tone="ok">🧠 Saisonplaner</Badge>}
                    {m.left_on && (
                      <Badge tone="warn">👋 Austritt zum {m.left_on}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted">
                    {m.email}
                    {m.phone && <> · 📱 {m.phone}</>}
                    {m.birthday && <> · 🎂 {m.birthday}</>}
                    {m.birthday_congrats && (
                      <>
                        {" "}
                        ·{" "}
                        <span title="Darf in der Mitgliedergruppe zum Geburtstag gratuliert werden">
                          🎉 Gratulation ok
                        </span>
                      </>
                    )}
                    {!m.birthday && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-warn">
                          Geburtstag fehlt (für Liga nötig)
                        </span>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <form action={setMemberRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className={`${inputClass} w-auto py-1`}
                    >
                      <option value="player">Spieler (Liga)</option>
                      <option value="member">Mitglied (ohne Liga)</option>
                      <option value="editor">Bearbeiter</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button className="rounded-lg border border-border px-3 py-1 text-sm hover:bg-border/40">
                      Speichern
                    </button>
                  </form>
                  {m.email && <RegenerateLink email={m.email} />}
                  <MemberActionButtons
                    id={m.id}
                    name={m.full_name || m.email || "Mitglied"}
                    isActive={m.is_active}
                    isSelf={m.id === me.id}
                  />
                </div>
              </div>

              {/* Stammdaten bearbeiten (Admin) */}
              <details
                key={gespeichert ?? "edit"}
                className="rounded-lg border border-border"
              >
                <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
                  ✏️ Daten bearbeiten
                </summary>
                <form
                  action={updateMemberData}
                  className="space-y-4 border-t border-border p-4"
                >
                  <input type="hidden" name="id" value={m.id} />
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Name">
                      <input
                        name="full_name"
                        required
                        defaultValue={m.full_name}
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Rolle"
                      hint={
                        m.id === me.id
                          ? "Deine eigene Admin-Rolle kannst du nicht ändern"
                          : undefined
                      }
                    >
                      <select
                        name="role"
                        defaultValue={m.role}
                        disabled={m.id === me.id}
                        className={inputClass}
                      >
                        <option value="player">Spieler (Liga)</option>
                        <option value="member">Mitglied (ohne Liga)</option>
                        <option value="editor">Bearbeiter</option>
                        <option value="admin">Admin</option>
                      </select>
                    </Field>
                    <Field label="Handynummer" hint="Ideal für WhatsApp-Abstimmungen">
                      <input
                        name="phone"
                        type="tel"
                        defaultValue={m.phone ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Geburtstag" hint="Für die Liga-Meldung">
                      <input
                        name="birthday"
                        type="date"
                        defaultValue={m.birthday ?? ""}
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Austritt zum (optional)"
                      hint="Ab diesem Tag wird das Mitglied automatisch deaktiviert und wandert zu „Ehemalige Mitglieder“ – leer = kein Austritt"
                    >
                      <input
                        name="left_on"
                        type="date"
                        defaultValue={m.left_on ?? ""}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="birthday_public"
                      defaultChecked={m.birthday_public ?? false}
                    />
                    Geburtstag im Mitglieder-Kalender anzeigen 🎂
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="birthday_congrats"
                      defaultChecked={m.birthday_congrats ?? false}
                    />
                    In der Mitgliedergruppe gratulieren 🎉
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="is_trainer"
                      defaultChecked={m.is_trainer ?? false}
                    />
                    💪 Trainer – darf Trainings eintragen
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="is_planner"
                      defaultChecked={m.is_planner ?? false}
                    />
                    🧠 Saisonplaner – darf eigene Planungs-Entwürfe pflegen
                  </label>
                  <Button type="submit">Speichern</Button>
                </form>
              </details>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>

      {/* Ehemalige / deaktivierte Mitglieder + ausgetretene Namen */}
      {(ehemalige.length > 0 || ausgetreteneNamen.length > 0) && (
        <details className="rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-4 font-semibold">
            👋 Ehemalige Mitglieder{" "}
            <span className="text-sm font-normal text-muted">
              ({ehemalige.length + ausgetreteneNamen.length})
            </span>
          </summary>
          <div className="space-y-3 border-t border-border p-5">
            <p className="text-sm text-muted">
              Deaktivierte Zugänge – kein Login, keine Benachrichtigungen,
              tauchen nirgends mehr auf. Mit „Entsperren“ jederzeit wieder
              aktivierbar (das Austrittsdatum wird dabei gelöscht).
            </p>
            {ehemalige.map((m) => (
              <Card key={m.id} className="opacity-80">
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {m.full_name || "(ohne Namen)"}
                      </span>
                      {m.left_on ? (
                        <Badge tone="warn">ausgetreten zum {m.left_on}</Badge>
                      ) : (
                        <Badge tone="danger">gesperrt</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted">{m.email}</p>
                  </div>
                  <MemberActionButtons
                    id={m.id}
                    name={m.full_name || m.email || "Mitglied"}
                    isActive={m.is_active}
                    isSelf={m.id === me.id}
                  />
                </CardBody>
              </Card>
            ))}
            {ausgetreteneNamen.map((inv) => (
              <Card key={inv.id} className="border-dashed opacity-80">
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{inv.full_name}</span>
                    <Badge tone="warn">ausgetreten zum {inv.left_on}</Badge>
                    <Badge>war noch nicht angemeldet</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <form action={reaktiviereInvite}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button className="text-sm text-ok hover:underline">
                        Wieder aktivieren
                      </button>
                    </form>
                    <form action={deleteInvite}>
                      <input type="hidden" name="id" value={inv.id} />
                      <button className="text-sm text-danger hover:underline">
                        Entfernen
                      </button>
                    </form>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
