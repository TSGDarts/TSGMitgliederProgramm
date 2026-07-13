import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import {
  toggleSurvey,
  assignTeam,
  unassignTeam,
  assignInviteTeam,
  unassignInviteTeam,
} from "../actions";
import { ArchiveButton } from "./ArchiveButton";
import { AdminSurveyForm } from "./AdminSurveyForm";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  EmptyState,
  inputClass,
} from "@/components/ui";
import {
  surveyLabel,
  shortLabel,
  type Season,
  type SurveyResponse,
  type SurveyAnswers,
  type ArchivedTeam,
} from "@/lib/season";
import type { Profile } from "@/lib/types";

// Sortier-Hilfen für die Planungsansicht
const captainRank: Record<string, number> = { yes: 0, maybe: 1 };
const freqRank: Record<string, number> = {
  always: 0,
  when_can: 1,
  as_needed: 2,
  backup: 3,
};

/** Eine Person in der Planung: registriertes Mitglied ODER angelegter Name. */
type PlanEntry = {
  key: string;
  kind: "profile" | "invite";
  id: string;
  name: string;
  r: SurveyAnswers | null;
  teamIds: string[];
};

export default async function AdminSeasonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireAdmin();
  const supabase = await createClient();

  const { data: seasonData } = await supabase
    .from("seasons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!seasonData) notFound();
  const season = seasonData as Season;

  // Antworten + Profile + Teams + angelegte Namen laden
  const [{ data: respData }, { data: profData }, teams] = await Promise.all([
    supabase.from("survey_responses").select("*").eq("season_id", id),
    supabase
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .neq("role", "member") // Mitglieder ohne Liga spielen hier keine Rolle
      .order("full_name"),
    getAllTeams(),
  ]);
  const responses = new Map(
    ((respData as SurveyResponse[]) ?? []).map((r) => [r.profile_id, r]),
  );
  const profiles = (profData as Profile[]) ?? [];

  // Noch nicht registrierte, vorab angelegte Namen + deren Antworten
  const { data: invData } = await supabase
    .from("member_invites")
    .select("id, full_name, role, team_ids")
    .eq("claimed", false)
    .neq("role", "member")
    .order("full_name");
  const invites = (invData ?? []) as Array<{
    id: string;
    full_name: string;
    role: string;
    team_ids: string[];
  }>;

  const inviteResponses = new Map<string, SurveyAnswers>();
  const { data: invRespData } = await supabase
    .from("survey_responses_invites")
    .select("*")
    .eq("season_id", id);
  for (const r of invRespData ?? []) {
    inviteResponses.set(
      r.invite_id as string,
      r as unknown as SurveyAnswers,
    );
  }

  // Team-Zuordnungen der registrierten Mitglieder
  const { data: tmData } = await supabase
    .from("team_members")
    .select("team_id,profile_id");
  const memberTeams = new Map<string, string[]>();
  for (const tm of tmData ?? []) {
    const list = memberTeams.get(tm.profile_id as string) ?? [];
    list.push(tm.team_id as string);
    memberTeams.set(tm.profile_id as string, list);
  }
  const teamById = new Map(teams.map((t) => [t.id, t]));

  // Archiv-Schnappschüsse (bei archivierten Saisons)
  let archive: ArchivedTeam[] = [];
  if (season.status === "archived") {
    const { data } = await supabase
      .from("season_team_archive")
      .select("*")
      .eq("season_id", id)
      .order("team_name");
    archive = (data as ArchivedTeam[]) ?? [];
  }

  // Gemeinsame Liste: Mitglieder + angelegte Namen
  const entries: PlanEntry[] = [
    ...profiles.map((p) => ({
      key: `p:${p.id}`,
      kind: "profile" as const,
      id: p.id,
      name: p.full_name || p.email || "?",
      r: responses.get(p.id) ?? null,
      teamIds: memberTeams.get(p.id) ?? [],
    })),
    ...invites.map((inv) => ({
      key: `i:${inv.id}`,
      kind: "invite" as const,
      id: inv.id,
      name: inv.full_name,
      r: inviteResponses.get(inv.id) ?? null,
      teamIds: inv.team_ids ?? [],
    })),
  ];

  // Sortierung: Kapitänskandidaten zuerst, dann Einsatz, Unbeantwortete ans Ende
  const sorted = entries.sort((a, b) => {
    if (!a.r && !b.r) return a.name.localeCompare(b.name);
    if (!a.r) return 1;
    if (!b.r) return -1;
    const ca = captainRank[a.r.captain_interest] ?? 2;
    const cb = captainRank[b.r.captain_interest] ?? 2;
    if (ca !== cb) return ca - cb;
    const fa = freqRank[a.r.play_frequency] ?? 4;
    const fb = freqRank[b.r.play_frequency] ?? 4;
    if (fa !== fb) return fa - fb;
    return a.name.localeCompare(b.name);
  });

  const answered = entries.filter((e) => e.r).length;

  return (
    <div className="space-y-8">
      <Link
        href="/mitglieder/admin/saisons"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Saisons
      </Link>

      <PageHeader
        title={season.name}
        subtitle={
          season.status === "archived"
            ? "Archivierte Saison"
            : `Saisonabfrage: ${answered} von ${entries.length} Personen erfasst`
        }
      />

      {season.status === "archived" ? (
        /* ================= ARCHIV-ANSICHT ================= */
        <section className="space-y-4">
          <h2 className="text-lg font-bold">Teams dieser Saison</h2>
          {archive.length === 0 ? (
            <EmptyState title="Keine archivierten Teams vorhanden" />
          ) : (
            archive.map((t) => (
              <Card key={t.id}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold">{t.team_name}</span>
                      {t.league && (
                        <span className="ml-2 text-sm text-muted">
                          {t.league}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted">
                      {t.stats.termine ?? 0} Termine · {t.stats.zusagen ?? 0}{" "}
                      Zusagen · {t.stats.absagen ?? 0} Absagen
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {t.roster.map((r, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-border/40 px-2.5 py-0.5 text-sm"
                      >
                        {r.name}
                        {r.captain && <Badge tone="primary">C</Badge>}
                        {r.vice && <Badge>VC</Badge>}
                      </span>
                    ))}
                  </div>
                  {(t.stats.spieler?.length ?? 0) > 0 && (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-primary">
                        Statistik je Spieler anzeigen
                      </summary>
                      <div className="mt-2 space-y-1 text-muted">
                        {t.stats.spieler!.map((s, i) => (
                          <p key={i}>
                            {s.name}: {s.zusagen} Zusagen, {s.absagen} Absagen,{" "}
                            {s.vielleicht} Vielleicht
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
                </CardBody>
              </Card>
            ))
          )}
        </section>
      ) : (
        /* ================= PLANUNGS-ANSICHT ================= */
        <>
          {/* Abfrage steuern */}
          <Card className="bg-primary/5">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  Saisonabfrage ist {season.survey_open ? "GEÖFFNET" : "geschlossen"}
                </p>
                <p className="text-sm text-muted">
                  {season.survey_open
                    ? "Mitglieder sehen die Abfrage auf ihrer Übersicht und unter „Saisonabfrage“."
                    : "Öffne die Abfrage, damit die Mitglieder selbst antworten können. Nachtragen kannst du unabhängig davon."}
                </p>
              </div>
              <form action={toggleSurvey}>
                <input type="hidden" name="id" value={season.id} />
                <input
                  type="hidden"
                  name="open"
                  value={String(!season.survey_open)}
                />
                <Button
                  type="submit"
                  variant={season.survey_open ? "secondary" : "primary"}
                >
                  {season.survey_open ? "Abfrage schließen" : "Abfrage öffnen"}
                </Button>
              </form>
            </CardBody>
          </Card>

          {/* Planung */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Antworten & Mannschaftsplanung</h2>
            <p className="text-sm text-muted">
              Sortiert: Kapitäns-Kandidaten zuerst, dann nach Einsatz-Bereitschaft.
              Auch vorab angelegte Namen (noch nicht registriert) sind dabei –
              deren Antworten wandern bei der Registrierung automatisch mit.
            </p>

            {sorted.map((e) => {
              const available = teams.filter((t) => !e.teamIds.includes(t.id));
              return (
                <Card key={e.key} className={e.r ? "" : "opacity-70"}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{e.name}</span>
                        {e.kind === "invite" && (
                          <Badge tone="warn">noch nicht registriert</Badge>
                        )}
                        {e.r?.captain_interest === "yes" && (
                          <Badge tone="primary">Will Kapitän!</Badge>
                        )}
                        {e.r?.captain_interest === "maybe" && (
                          <Badge>Kapitän möglich</Badge>
                        )}
                        {e.r?.played_last_season === false && (
                          <Badge tone="warn">Neu in der Liga</Badge>
                        )}
                        {!e.r && <Badge tone="warn">keine Antwort</Badge>}
                      </div>
                    </div>

                    {e.r && (
                      <div className="grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
                        <p>
                          <strong className="text-foreground">Einsatz:</strong>{" "}
                          {surveyLabel("play_frequency", e.r.play_frequency)}
                        </p>
                        <p>
                          <strong className="text-foreground">Ambition:</strong>{" "}
                          {surveyLabel("ambitions", e.r.ambitions)}
                        </p>
                        <p>
                          <strong className="text-foreground">Aussetzen:</strong>{" "}
                          {surveyLabel("sit_out", e.r.sit_out)}
                        </p>
                        <p>
                          <strong className="text-foreground">Pokale:</strong>{" "}
                          KU: {shortLabel(e.r.pokal_ku)} · 8ter:{" "}
                          {shortLabel(e.r.pokal_8er)}
                        </p>
                        {e.r.team_wishes && (
                          <p className="sm:col-span-2">
                            <strong className="text-foreground">Wünsche:</strong>{" "}
                            {e.r.team_wishes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Antworten nachtragen / bearbeiten (Admin) */}
                    <details className="rounded-lg border border-border">
                      <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
                        ✏️ Antworten {e.r ? "bearbeiten" : "nachtragen"}
                      </summary>
                      <div className="border-t border-border p-4">
                        <AdminSurveyForm
                          seasonId={season.id}
                          profileId={e.kind === "profile" ? e.id : undefined}
                          inviteId={e.kind === "invite" ? e.id : undefined}
                          existing={e.r}
                        />
                      </div>
                    </details>

                    {/* Team-Zuordnung */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      {e.teamIds.map((tid) => {
                        const t = teamById.get(tid);
                        if (!t) return null;
                        return (
                          <form
                            key={tid}
                            action={
                              e.kind === "profile"
                                ? unassignTeam
                                : unassignInviteTeam
                            }
                            className="inline-flex"
                          >
                            <input type="hidden" name="season_id" value={season.id} />
                            <input type="hidden" name="team_id" value={tid} />
                            {e.kind === "profile" ? (
                              <input type="hidden" name="profile_id" value={e.id} />
                            ) : (
                              <input type="hidden" name="invite_id" value={e.id} />
                            )}
                            <button
                              className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary hover:bg-primary/25"
                              title="Aus Team entfernen"
                            >
                              {t.name} ✕
                            </button>
                          </form>
                        );
                      })}
                      {available.length > 0 && (
                        <form
                          action={
                            e.kind === "profile" ? assignTeam : assignInviteTeam
                          }
                          className="inline-flex items-center gap-1"
                        >
                          <input type="hidden" name="season_id" value={season.id} />
                          {e.kind === "profile" ? (
                            <input type="hidden" name="profile_id" value={e.id} />
                          ) : (
                            <input type="hidden" name="invite_id" value={e.id} />
                          )}
                          <select
                            name="team_id"
                            className={`${inputClass} w-auto py-1 text-sm`}
                            defaultValue=""
                            required
                          >
                            <option value="" disabled>
                              + Team zuordnen …
                            </option>
                            {available.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          <button className="rounded-lg border border-border px-2 py-1 text-sm hover:bg-border/40">
                            OK
                          </button>
                        </form>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </section>

          {/* Abschließen */}
          <Card className="border-warn/40">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Saison beenden</p>
                <p className="text-sm text-muted">
                  Übernimmt alle Teams mit Kader & Statistiken ins Archiv. Die
                  Teams bleiben danach für die neue Saison bestehen.
                </p>
              </div>
              <ArchiveButton id={season.id} name={season.name} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
