import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import { toggleSurvey, assignTeam, unassignTeam } from "../actions";
import { ArchiveButton } from "./ArchiveButton";
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
  type ArchivedTeam,
} from "@/lib/season";
import type { Profile, Team } from "@/lib/types";

// Sortier-Hilfen für die Planungsansicht
const captainRank: Record<string, number> = { yes: 0, maybe: 1 };
const freqRank: Record<string, number> = {
  always: 0,
  when_can: 1,
  as_needed: 2,
  backup: 3,
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

  // Antworten + Profile + Teams laden
  const [{ data: respData }, { data: profData }, teams] = await Promise.all([
    supabase.from("survey_responses").select("*").eq("season_id", id),
    supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
    getAllTeams(),
  ]);
  const responses = new Map(
    ((respData as SurveyResponse[]) ?? []).map((r) => [r.profile_id, r]),
  );
  const profiles = (profData as Profile[]) ?? [];

  // Team-Zuordnungen aller Personen
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

  // Planungs-Sortierung: Kapitänskandidaten zuerst, dann nach Einsatzlevel,
  // Unbeantwortete ans Ende.
  const sorted = [...profiles].sort((a, b) => {
    const ra = responses.get(a.id);
    const rb = responses.get(b.id);
    if (!ra && !rb) return a.full_name.localeCompare(b.full_name);
    if (!ra) return 1;
    if (!rb) return -1;
    const ca = captainRank[ra.captain_interest] ?? 2;
    const cb = captainRank[rb.captain_interest] ?? 2;
    if (ca !== cb) return ca - cb;
    const fa = freqRank[ra.play_frequency] ?? 4;
    const fb = freqRank[rb.play_frequency] ?? 4;
    if (fa !== fb) return fa - fb;
    return a.full_name.localeCompare(b.full_name);
  });

  const answered = profiles.filter((p) => responses.has(p.id)).length;

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
            : `Saisonabfrage: ${answered} von ${profiles.length} Mitgliedern beantwortet`
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
                    : "Öffne die Abfrage, damit die Mitglieder antworten können."}
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
              Teile die Spieler direkt hier den Mannschaften zu.
            </p>

            {sorted.map((p) => {
              const r = responses.get(p.id);
              const myTeams = memberTeams.get(p.id) ?? [];
              const available = teams.filter((t) => !myTeams.includes(t.id));
              return (
                <Card key={p.id} className={r ? "" : "opacity-60"}>
                  <CardBody className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.full_name}</span>
                        {r?.captain_interest === "yes" && (
                          <Badge tone="primary">Will Kapitän!</Badge>
                        )}
                        {r?.captain_interest === "maybe" && (
                          <Badge>Kapitän möglich</Badge>
                        )}
                        {r?.played_last_season === false && (
                          <Badge tone="warn">Neu in der Liga</Badge>
                        )}
                        {!r && <Badge tone="warn">keine Antwort</Badge>}
                      </div>
                    </div>

                    {r && (
                      <div className="grid gap-x-6 gap-y-1 text-sm text-muted sm:grid-cols-2">
                        <p>
                          <strong className="text-foreground">Einsatz:</strong>{" "}
                          {surveyLabel("play_frequency", r.play_frequency)}
                        </p>
                        <p>
                          <strong className="text-foreground">Ambition:</strong>{" "}
                          {surveyLabel("ambitions", r.ambitions)}
                        </p>
                        <p>
                          <strong className="text-foreground">Aussetzen:</strong>{" "}
                          {surveyLabel("sit_out", r.sit_out)}
                        </p>
                        <p>
                          <strong className="text-foreground">Pokale:</strong>{" "}
                          KU: {shortLabel(r.pokal_ku)} · 8ter:{" "}
                          {shortLabel(r.pokal_8er)}
                        </p>
                        {r.team_wishes && (
                          <p className="sm:col-span-2">
                            <strong className="text-foreground">Wünsche:</strong>{" "}
                            {r.team_wishes}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Team-Zuordnung */}
                    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                      {myTeams.map((tid) => {
                        const t = teamById.get(tid) as Team | undefined;
                        if (!t) return null;
                        return (
                          <form
                            key={tid}
                            action={unassignTeam}
                            className="inline-flex"
                          >
                            <input type="hidden" name="season_id" value={season.id} />
                            <input type="hidden" name="team_id" value={tid} />
                            <input type="hidden" name="profile_id" value={p.id} />
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
                          action={assignTeam}
                          className="inline-flex items-center gap-1"
                        >
                          <input type="hidden" name="season_id" value={season.id} />
                          <input type="hidden" name="profile_id" value={p.id} />
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
