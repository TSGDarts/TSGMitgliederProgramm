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
  addPokal,
  removePokal,
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
  SURVEY_QUESTIONS,
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

/** Kleine Balken-Verteilung für die Auswertung. */
function Dist({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.label} className="text-sm">
            <div className="mb-0.5 flex items-baseline justify-between gap-2">
              <span className="min-w-0 flex-1 truncate text-muted" title={r.label}>
                {r.label}
              </span>
              <span className="font-semibold">{r.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-border/60">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ zeige?: string }>;
}) {
  const { id } = await params;
  const { zeige } = await searchParams;
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

  // Pokal-Kader dieser Saison
  const { data: squadData } = await supabase
    .from("pokal_squads")
    .select("id, kind, profile_id, invite_id")
    .eq("season_id", id);
  const squads = (squadData ?? []) as Array<{
    id: string;
    kind: string;
    profile_id: string | null;
    invite_id: string | null;
  }>;

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

  // ---------- Auswertung der Abfrage ----------
  // Zählt pro Frage, wie oft jede Antwort gewählt wurde (inkl. Sonstiges).
  const distFor = (field: "play_frequency" | "captain_interest" | "ambitions" | "sit_out") => {
    const q = SURVEY_QUESTIONS.find((x) => x.field === field)!;
    const rows = q.options.map((o) => ({
      label: o.label,
      count: entries.filter((e) => e.r?.[field] === o.value).length,
    }));
    const other = entries.filter(
      (e) => e.r && e.r[field] && !q.options.some((o) => o.value === e.r![field]),
    ).length;
    if (other > 0) rows.push({ label: "Sonstiges", count: other });
    return rows;
  };

  const pokalCount = (field: "pokal_ku" | "pokal_8er") => ({
    yes: entries.filter((e) => e.r?.[field] === "yes").length,
    ifNeeded: entries.filter((e) => e.r?.[field] === "if_needed").length,
  });

  const captains = entries.filter((e) => e.r?.captain_interest === "yes");
  const captainsMaybe = entries.filter((e) => e.r?.captain_interest === "maybe");
  const newInLeague = entries.filter((e) => e.r?.played_last_season === false);
  const wishes = entries.filter((e) => e.r?.team_wishes);
  const stammCount = entries.filter((e) => e.r?.play_frequency === "always").length;
  const flexCount = entries.filter(
    (e) => e.r?.play_frequency === "when_can" || e.r?.play_frequency === "as_needed",
  ).length;

  // ---------- Filter für die Personenliste ----------
  const FILTERS: { key: string; label: string; test: (e: PlanEntry) => boolean }[] = [
    { key: "kapitaene", label: "Kapitäns-Kandidaten", test: (e) => e.r?.captain_interest === "yes" || e.r?.captain_interest === "maybe" },
    { key: "stamm", label: "Jedes Spiel da", test: (e) => e.r?.play_frequency === "always" },
    { key: "flexibel", label: "Flexibel", test: (e) => e.r?.play_frequency === "when_can" || e.r?.play_frequency === "as_needed" },
    { key: "backup", label: "Nur Backup", test: (e) => e.r?.play_frequency === "backup" },
    { key: "neu", label: "Neu in der Liga", test: (e) => e.r?.played_last_season === false },
    { key: "ohneteam", label: "Noch ohne Team", test: (e) => e.teamIds.length === 0 },
    { key: "offen", label: "Ohne Antwort", test: (e) => !e.r },
  ];
  const activeFilter = FILTERS.find((f) => f.key === zeige) ?? null;
  const visible = activeFilter ? sorted.filter(activeFilter.test) : sorted;

  // Pokal-Planung: Bereitschaft aus der Abfrage + aktuelle Kader
  const entryByKey = new Map(entries.map((e) => [e.key, e]));
  const pokalRank = (v: string) =>
    v === "yes" ? 0 : v === "if_needed" ? 1 : v === "no" ? 3 : v ? 2 : 4;
  const POKALS = [
    {
      kind: "ku",
      title: "Klaus Unterberg Pokal",
      hint: "Mittelfranken-Pokal · 4 Spieler",
      field: "pokal_ku" as const,
      size: 4,
    },
    {
      kind: "8er",
      title: "8ter Cup",
      hint: "BDV-Pokal · 8 Spieler",
      field: "pokal_8er" as const,
      size: 8,
    },
  ];

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

          {/* Auswertung */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Auswertung der Abfrage</h2>
              <a
                href={`/mitglieder/admin/saisons/${season.id}/export`}
                className="inline-flex items-center rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-border/40"
              >
                📥 Als CSV exportieren (Excel)
              </a>
            </div>

            {/* Kennzahlen */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardBody className="py-4">
                  <p className="text-2xl font-bold">
                    {answered}
                    <span className="text-base font-normal text-muted">
                      /{entries.length}
                    </span>
                  </p>
                  <p className="text-sm text-muted">Antworten erfasst</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="py-4">
                  <p className="text-2xl font-bold">
                    {stammCount}
                    <span className="text-base font-normal text-muted">
                      {" "}
                      + {flexCount} flexibel
                    </span>
                  </p>
                  <p className="text-sm text-muted">
                    Stammspieler (jedes Spiel) + Flexible
                  </p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="py-4">
                  <p className="text-2xl font-bold">
                    {captains.length}
                    <span className="text-base font-normal text-muted">
                      {" "}
                      + {captainsMaybe.length} evtl.
                    </span>
                  </p>
                  <p className="text-sm text-muted">Kapitäns-Kandidaten</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="py-4">
                  <p className="text-2xl font-bold">
                    {pokalCount("pokal_ku").yes + pokalCount("pokal_ku").ifNeeded}
                    <span className="text-base font-normal text-muted">
                      {" "}
                      KU ·{" "}
                    </span>
                    {pokalCount("pokal_8er").yes +
                      pokalCount("pokal_8er").ifNeeded}
                    <span className="text-base font-normal text-muted">
                      {" "}
                      8ter
                    </span>
                  </p>
                  <p className="text-sm text-muted">
                    Pokal-Interesse (Ja + wenn nötig)
                  </p>
                </CardBody>
              </Card>
            </div>

            {/* Verteilungen */}
            <Card>
              <CardBody className="grid gap-6 md:grid-cols-2">
                <Dist title="Wie viel wollen sie spielen?" rows={distFor("play_frequency")} />
                <Dist title="Ambitionen" rows={distFor("ambitions")} />
                <Dist title="Aussetzen für den Team-Erfolg?" rows={distFor("sit_out")} />
                <Dist title="Kapitän machen?" rows={distFor("captain_interest")} />
              </CardBody>
            </Card>

            {/* Namenslisten */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardBody className="space-y-2">
                  <h3 className="font-semibold">
                    Kapitäns-Kandidaten{" "}
                    <span className="text-sm font-normal text-muted">
                      ({captains.length + captainsMaybe.length})
                    </span>
                  </h3>
                  {captains.length + captainsMaybe.length === 0 ? (
                    <p className="text-sm text-muted">Noch keine.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {captains.map((e) => (
                        <Badge key={e.key} tone="primary">
                          {e.name} – will!
                        </Badge>
                      ))}
                      {captainsMaybe.map((e) => (
                        <Badge key={e.key}>{e.name} – wenn nötig</Badge>
                      ))}
                    </div>
                  )}
                  {newInLeague.length > 0 && (
                    <>
                      <h3 className="pt-2 font-semibold">
                        Neu in der Liga{" "}
                        <span className="text-sm font-normal text-muted">
                          ({newInLeague.length})
                        </span>
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {newInLeague.map((e) => (
                          <Badge key={e.key} tone="warn">
                            {e.name}
                          </Badge>
                        ))}
                      </div>
                    </>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardBody className="space-y-2">
                  <h3 className="font-semibold">
                    Wünsche zur Mannschaftsbildung{" "}
                    <span className="text-sm font-normal text-muted">
                      ({wishes.length})
                    </span>
                  </h3>
                  {wishes.length === 0 ? (
                    <p className="text-sm text-muted">Noch keine Wünsche.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {wishes.map((e) => (
                        <li key={e.key}>
                          <strong>{e.name}:</strong>{" "}
                          <span className="text-muted">{e.r!.team_wishes}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>
          </section>

          {/* Pokal-Planung */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Pokal-Planung</h2>
            <p className="text-sm text-muted">
              Die Auswahl zeigt die Bereitschaft aus der Saisonabfrage – wer
              „Ja“ gesagt hat, steht oben.
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {POKALS.map((pokal) => {
                const assigned = squads.filter((s) => s.kind === pokal.kind);
                const assignedKeys = new Set(
                  assigned.map((s) =>
                    s.profile_id ? `p:${s.profile_id}` : `i:${s.invite_id}`,
                  ),
                );
                const candidates = entries
                  .filter((e) => !assignedKeys.has(e.key))
                  .sort(
                    (a, b) =>
                      pokalRank(a.r?.[pokal.field] ?? "") -
                        pokalRank(b.r?.[pokal.field] ?? "") ||
                      a.name.localeCompare(b.name),
                  );
                return (
                  <Card key={pokal.kind}>
                    <CardBody className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-semibold">{pokal.title}</span>
                          <p className="text-sm text-muted">{pokal.hint}</p>
                        </div>
                        <Badge
                          tone={
                            assigned.length >= pokal.size ? "ok" : "neutral"
                          }
                        >
                          {assigned.length}/{pokal.size}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {assigned.length === 0 && (
                          <span className="text-sm text-muted">
                            Noch niemand zugeordnet.
                          </span>
                        )}
                        {assigned.map((s) => {
                          const key = s.profile_id
                            ? `p:${s.profile_id}`
                            : `i:${s.invite_id}`;
                          const person = entryByKey.get(key);
                          return (
                            <form
                              key={s.id}
                              action={removePokal}
                              className="inline-flex"
                            >
                              <input
                                type="hidden"
                                name="season_id"
                                value={season.id}
                              />
                              <input type="hidden" name="id" value={s.id} />
                              <button
                                className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1 text-sm text-primary hover:bg-primary/25"
                                title="Aus Pokal-Kader entfernen"
                              >
                                {person?.name ?? "(unbekannt)"} ✕
                              </button>
                            </form>
                          );
                        })}
                      </div>

                      {candidates.length > 0 && (
                        <form
                          action={addPokal}
                          className="flex items-center gap-1"
                        >
                          <input
                            type="hidden"
                            name="season_id"
                            value={season.id}
                          />
                          <input type="hidden" name="kind" value={pokal.kind} />
                          <select
                            name="target"
                            className={`${inputClass} w-auto py-1 text-sm`}
                            defaultValue=""
                            required
                          >
                            <option value="" disabled>
                              + Person zuordnen …
                            </option>
                            {candidates.map((e) => {
                              const answer = e.r?.[pokal.field] ?? "";
                              return (
                                <option
                                  key={e.key}
                                  value={`${e.kind === "profile" ? "p" : "i"}:${e.id}`}
                                >
                                  {e.name}
                                  {answer ? ` – ${shortLabel(answer)}` : " – ?"}
                                </option>
                              );
                            })}
                          </select>
                          <button className="rounded-lg border border-border px-2 py-1 text-sm hover:bg-border/40">
                            OK
                          </button>
                        </form>
                      )}
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Planung */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Antworten & Mannschaftsplanung</h2>
            <p className="text-sm text-muted">
              Sortiert: Kapitäns-Kandidaten zuerst, dann nach Einsatz-Bereitschaft.
              Auch vorab angelegte Namen (noch nicht registriert) sind dabei –
              deren Antworten wandern bei der Registrierung automatisch mit.
            </p>

            {/* Filter */}
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/mitglieder/admin/saisons/${season.id}`}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  !activeFilter
                    ? "bg-primary text-primary-fg"
                    : "border border-border text-muted hover:text-foreground"
                }`}
              >
                Alle ({entries.length})
              </Link>
              {FILTERS.map((f) => {
                const count = sorted.filter(f.test).length;
                if (count === 0 && zeige !== f.key) return null;
                return (
                  <Link
                    key={f.key}
                    href={`/mitglieder/admin/saisons/${season.id}?zeige=${f.key}`}
                    className={`rounded-full px-3 py-1 text-sm font-medium ${
                      zeige === f.key
                        ? "bg-primary text-primary-fg"
                        : "border border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {f.label} ({count})
                  </Link>
                );
              })}
            </div>

            {visible.length === 0 && (
              <EmptyState title="Niemand passt zu diesem Filter" />
            )}

            {visible.map((e) => {
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
