import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTeamRoster } from "@/lib/member-queries";
import {
  updateTeam,
  addRosterMember,
  removeRosterMember,
  setTeamRole,
} from "../actions";
import { ImportButton } from "./ImportButton";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  inputClass,
  Badge,
} from "@/components/ui";
import type { Profile, Team } from "@/lib/types";

export default async function AdminTeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createClient();

  const { data: teamData } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!teamData) notFound();
  const team = teamData as Team;

  const roster = await getTeamRoster(team.id);
  const rosterIds = new Set(roster.map((r) => r.profile_id));

  const { data: allProfiles } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");
  const available = ((allProfiles as Profile[]) ?? []).filter(
    (p) => !rosterIds.has(p.id) && p.role !== "member", // ohne Liga: kein Kader
  );

  return (
    <div className="space-y-8">
      <Link
        href="/mitglieder/admin/mannschaften"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Mannschaften
      </Link>
      <PageHeader title={`${team.name} verwalten`} />

      {/* Stammdaten */}
      <Card>
        <CardBody>
          <form action={updateTeam} className="space-y-4">
            <input type="hidden" name="id" value={team.id} />
            <h2 className="font-semibold">Stammdaten & nuLiga</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input
                  name="name"
                  defaultValue={team.name}
                  required
                  className={inputClass}
                />
              </Field>
              <Field label="Liga">
                <input
                  name="league"
                  defaultValue={team.league ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Beschreibung">
              <textarea
                name="description"
                rows={2}
                defaultValue={team.description ?? ""}
                className={inputClass}
              />
            </Field>
            <Field
              label="nuLiga-Adresse (Tabelle/Spielplan)"
              hint="Link zur öffentlichen nuLiga-Seite dieser Mannschaft"
            >
              <input
                name="nuliga_url"
                defaultValue={team.nuliga_url ?? ""}
                placeholder="https://…"
                className={inputClass}
              />
            </Field>
            <Field
              label="nuLiga iCal-Adresse (Kalender-Export)"
              hint="Für den automatischen Import der Spieltermine"
            >
              <input
                name="nuliga_ical_url"
                defaultValue={team.nuliga_ical_url ?? ""}
                placeholder="https://…/…ics"
                className={inputClass}
              />
            </Field>
            <Button type="submit">Speichern</Button>
          </form>
        </CardBody>
      </Card>

      {/* nuLiga-Import */}
      <Card>
        <CardBody className="space-y-3">
          <h2 className="font-semibold">Spieltermine importieren</h2>
          <p className="text-sm text-muted">
            Liest den nuLiga-Kalender und legt die Punktspiele als Termine an
            (bestehende werden aktualisiert).
          </p>
          <ImportButton teamId={team.id} icalUrl={team.nuliga_ical_url ?? ""} />
        </CardBody>
      </Card>

      {/* Kader */}
      <Card>
        <CardBody className="space-y-4">
          <h2 className="font-semibold">
            Kader{" "}
            <span className="text-sm font-normal text-muted">
              ({roster.length})
            </span>
          </h2>

          {roster.length > 0 && (
            <div className="divide-y divide-border">
              {roster.map((m) => (
                <div
                  key={m.profile_id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span className="flex items-center gap-2">
                    {m.profile.full_name || m.profile.email}
                    {m.is_captain && <Badge tone="primary">Kapitän</Badge>}
                    {m.is_vice_captain && <Badge>Vize</Badge>}
                  </span>
                  <div className="flex items-center gap-2">
                    <form action={setTeamRole} className="flex items-center gap-1">
                      <input type="hidden" name="team_id" value={team.id} />
                      <input
                        type="hidden"
                        name="profile_id"
                        value={m.profile_id}
                      />
                      <select
                        name="team_role"
                        defaultValue={
                          m.is_captain
                            ? "captain"
                            : m.is_vice_captain
                              ? "vice"
                              : "none"
                        }
                        className={`${inputClass} w-auto py-1`}
                      >
                        <option value="none">Spieler</option>
                        <option value="captain">Kapitän</option>
                        <option value="vice">Vize-Kapitän</option>
                      </select>
                      <button className="rounded-lg border border-border px-2 py-1 text-sm hover:bg-border/40">
                        OK
                      </button>
                    </form>
                    <form action={removeRosterMember}>
                      <input type="hidden" name="team_id" value={team.id} />
                      <input
                        type="hidden"
                        name="profile_id"
                        value={m.profile_id}
                      />
                      <button className="text-sm text-danger hover:underline">
                        Entfernen
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          {available.length > 0 ? (
            <form action={addRosterMember} className="flex flex-wrap gap-2">
              <input type="hidden" name="team_id" value={team.id} />
              <select name="profile_id" required className={`${inputClass} w-auto`}>
                <option value="">Mitglied auswählen …</option>
                {available.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="secondary">
                Zum Kader hinzufügen
              </Button>
            </form>
          ) : (
            <p className="text-sm text-muted">
              Alle Mitglieder sind bereits im Kader.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
