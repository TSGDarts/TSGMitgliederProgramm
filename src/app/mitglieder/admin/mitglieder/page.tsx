import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import Link from "next/link";
import { CreateMemberForm } from "./CreateMemberForm";
import { RegenerateLink } from "./RegenerateLink";
import { MemberActionButtons } from "./MemberActionButtons";
import { setMemberRole, updateMemberData } from "./actions";
import { deleteInvite } from "../beitritt/actions";
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

export default async function AdminMembersPage() {
  const me = await requireAdmin();
  const teams = await getAllTeams();
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");
  const members = (data as Profile[]) ?? [];

  // Vorab angelegte Namen, die noch auf die Selbst-Anmeldung warten
  const { data: invitesData } = await supabase
    .from("member_invites")
    .select("id, full_name, role, team_ids")
    .eq("claimed", false)
    .order("full_name");
  const openInvites = (invitesData ?? []) as Array<{
    id: string;
    full_name: string;
    role: string;
    team_ids: string[];
  }>;
  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mitglieder verwalten"
        subtitle="Zugänge anlegen, Rollen vergeben, Passwort-Links erzeugen"
      />

      <CreateMemberForm teams={teams} />

      {openInvites.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">
            Angelegt – warten auf Selbst-Anmeldung{" "}
            <span className="text-sm font-normal text-muted">
              ({openInvites.length})
            </span>
          </h2>
          <div className="space-y-2">
            {openInvites.map((inv) => (
              <Card key={inv.id} className="border-dashed">
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{inv.full_name}</span>
                    {inv.role === "admin" && <Badge tone="primary">Admin</Badge>}
                    {inv.role === "member" && <Badge>ohne Liga</Badge>}
                    <Badge tone="warn">noch nicht angemeldet</Badge>
                    {inv.team_ids?.length > 0 && (
                      <span className="text-sm text-muted">
                        {inv.team_ids.map(teamName).filter(Boolean).join(", ")}
                      </span>
                    )}
                  </div>
                  <form action={deleteInvite}>
                    <input type="hidden" name="id" value={inv.id} />
                    <button className="text-sm text-danger hover:underline">
                      Entfernen
                    </button>
                  </form>
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
            ({members.length})
          </span>
        </h2>
        <div className="space-y-3">
          {members.map((m) => (
            <Card key={m.id}>
              <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {m.full_name || "(ohne Namen)"}
                    </span>
                    {m.role === "admin" && <Badge tone="primary">Admin</Badge>}
                    {m.role === "member" && <Badge>ohne Liga</Badge>}
                    {!m.is_active && <Badge tone="danger">inaktiv</Badge>}
                  </div>
                  <p className="text-sm text-muted">
                    {m.email}
                    {m.phone && <> · 📱 {m.phone}</>}
                    {m.birthday && <> · 🎂 {m.birthday}</>}
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
              <details className="rounded-lg border border-border">
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
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="birthday_public"
                      defaultChecked={m.birthday_public ?? false}
                    />
                    Geburtstag im Mitglieder-Kalender anzeigen 🎂
                  </label>
                  <Button type="submit">Speichern</Button>
                </form>
              </details>
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
