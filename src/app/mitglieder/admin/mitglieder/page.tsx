import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import { CreateMemberForm } from "./CreateMemberForm";
import { RegenerateLink } from "./RegenerateLink";
import { MemberActionButtons } from "./MemberActionButtons";
import { setMemberRole } from "./actions";
import { PageHeader, Card, CardBody, Badge, inputClass } from "@/components/ui";
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

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mitglieder verwalten"
        subtitle="Zugänge anlegen, Rollen vergeben, Passwort-Links erzeugen"
      />

      <CreateMemberForm teams={teams} />

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
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {m.full_name || "(ohne Namen)"}
                    </span>
                    {m.role === "admin" && <Badge tone="primary">Admin</Badge>}
                    {!m.is_active && <Badge tone="danger">inaktiv</Badge>}
                  </div>
                  <p className="text-sm text-muted">{m.email}</p>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <form action={setMemberRole} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={m.id} />
                    <select
                      name="role"
                      defaultValue={m.role}
                      className={`${inputClass} w-auto py-1`}
                    >
                      <option value="player">Spieler</option>
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
              </CardBody>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
