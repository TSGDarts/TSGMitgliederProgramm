import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import {
  toggleSurvey,
  updateArchivTeam,
  addArchivTeam,
  refreshArchivStatistik,
} from "../actions";
import { AltSaisonImport } from "./AltSaisonImport";
import { ArchivKaderFeld } from "./ArchivKaderFeld";
import { formatHomeMatch } from "@/lib/extras";
import { PokalPlanner } from "./PokalPlanner";
import { TeamPlanner } from "./TeamPlanner";
import { ArchiveButton } from "./ArchiveButton";
import {
  SaisonLoeschenKnopf,
  ArchivEintragLoeschenKnopf,
} from "./ArchivKnoepfe";
import { AdminSurveyForm } from "./AdminSurveyForm";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Badge,
  EmptyState,
  Field,
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
    .select("*")
    .eq("claimed", false)
    .neq("role", "member")
    .order("full_name");
  const invites = (invData ?? []) as Array<{
    id: string;
    full_name: string;
    role: string;
    team_ids: string[];
    captain_of?: string | null;
    vice_of?: string | null;
  }>;

  // Kapitäns-Rollen der vorab angelegten Namen
  const inviteRoleMap = new Map<string, "captain" | "vice">();
  for (const inv of invites) {
    if (inv.captain_of) inviteRoleMap.set(`${inv.id}:${inv.captain_of}`, "captain");
    if (inv.vice_of) inviteRoleMap.set(`${inv.id}:${inv.vice_of}`, "vice");
  }

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
  // is_captain gibt es erst nach Skript 46 – Ersatz-Abfrage für alte DBs
  let squadData: unknown = (
    await supabase
      .from("pokal_squads")
      .select("id, kind, team_no, profile_id, invite_id, is_captain")
      .eq("season_id", id)
  ).data;
  if (!squadData) {
    squadData = (
      await supabase
        .from("pokal_squads")
        .select("id, kind, team_no, profile_id, invite_id")
        .eq("season_id", id)
    ).data;
  }
  const squads = (squadData ?? []) as Array<{
    id: string;
    kind: string;
    team_no: number;
    profile_id: string | null;
    invite_id: string | null;
    is_captain?: boolean | null;
  }>;

  // Team-Zuordnungen der registrierten Mitglieder (inkl. Kapitäns-Rollen)
  const { data: tmData } = await supabase
    .from("team_members")
    .select("team_id,profile_id,is_captain,is_vice_captain");
  const memberTeams = new Map<string, string[]>();
  const teamRoleMap = new Map<string, "captain" | "vice">();
  for (const tm of tmData ?? []) {
    const list = memberTeams.get(tm.profile_id as string) ?? [];
    list.push(tm.team_id as string);
    memberTeams.set(tm.profile_id as string, list);
    if (tm.is_captain) {
      teamRoleMap.set(`${tm.profile_id}:${tm.team_id}`, "captain");
    } else if (tm.is_vice_captain) {
      teamRoleMap.set(`${tm.profile_id}:${tm.team_id}`, "vice");
    }
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

  // Alle angelegten Namen für die Kader-Auswahl beim Bearbeiten von
  // Archiv-Einträgen – bewusst OHNE Rollen-Filter: Wer heute „Mitglied
  // (ohne Liga)“ ist, kann in einer früheren Saison Liga gespielt haben.
  let alleNamen: string[] = [];
  if (season.status === "archived") {
    const [{ data: alleProf }, { data: alleInv }] = await Promise.all([
      supabase.from("profiles").select("full_name, email").order("full_name"),
      supabase
        .from("member_invites")
        .select("full_name")
        .eq("claimed", false)
        .order("full_name"),
    ]);
    alleNamen = [
      ...new Set([
        ...(alleProf ?? []).map(
          (p) => (p.full_name as string) || (p.email as string) || "?",
        ),
        ...(alleInv ?? []).map((i) => i.full_name as string),
      ]),
    ].sort((a, b) => a.localeCompare(b));
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

  // Pokal-Planung
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
                    <div className="flex items-center gap-3 text-sm text-muted">
                      <span>
                        {t.stats.termine ?? 0} Termine · {t.stats.zusagen ?? 0}{" "}
                        Zusagen · {t.stats.absagen ?? 0} Absagen
                      </span>
                      {t.stats.nuliga_url && (
                        <a
                          href={t.stats.nuliga_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          nuLiga ↗
                        </a>
                      )}
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

                  {/* Nachträglich bearbeiten (z. B. nachgetragene Saisons) */}
                  <details className="rounded-lg border border-border">
                    <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-primary">
                      ✏️ Bearbeiten
                    </summary>
                    <div className="space-y-3 border-t border-border p-4">
                      <form action={updateArchivTeam} className="space-y-3">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="season_id" value={season.id} />
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Team-Name">
                            <input
                              name="team_name"
                              required
                              defaultValue={t.team_name}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Liga">
                            <input
                              name="league"
                              defaultValue={t.league}
                              className={inputClass}
                            />
                          </Field>
                        </div>
                        <Field
                          label="nuLiga-Link (damalige Saison, optional)"
                          hint="Wird am Team als „nuLiga ↗“ angezeigt"
                        >
                          <input
                            name="nuliga_url"
                            type="url"
                            defaultValue={t.stats.nuliga_url ?? ""}
                            placeholder="https://dwbv.liga.nu/…"
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Kader">
                          <ArchivKaderFeld
                            namen={alleNamen}
                            initialText={t.roster
                              .map(
                                (r) =>
                                  r.name +
                                  (r.captain ? " C" : r.vice ? " VC" : ""),
                              )
                              .join("\n")}
                          />
                        </Field>
                        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                          <Field label="Termine">
                            <input
                              name="termine"
                              type="number"
                              min={0}
                              defaultValue={t.stats.termine ?? 0}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Zusagen">
                            <input
                              name="zusagen"
                              type="number"
                              min={0}
                              defaultValue={t.stats.zusagen ?? 0}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Absagen">
                            <input
                              name="absagen"
                              type="number"
                              min={0}
                              defaultValue={t.stats.absagen ?? 0}
                              className={inputClass}
                            />
                          </Field>
                          <Field label="Vielleicht">
                            <input
                              name="vielleicht"
                              type="number"
                              min={0}
                              defaultValue={t.stats.vielleicht ?? 0}
                              className={inputClass}
                            />
                          </Field>
                        </div>
                        <Button type="submit">Speichern</Button>
                      </form>
                      <div className="border-t border-border pt-3">
                        <ArchivEintragLoeschenKnopf
                          id={t.id}
                          seasonId={season.id}
                          name={t.team_name}
                        />
                      </div>
                    </div>
                  </details>
                </CardBody>
              </Card>
            ))
          )}

          {/* Spieltage der damaligen Saison importieren */}
          <details className="rounded-xl border border-border bg-surface">
            <summary className="cursor-pointer px-5 py-4 font-semibold">
              📅 Spieltage nachtragen (nuLiga-Import)
            </summary>
            <div className="space-y-3 border-t border-border p-5">
              <p className="text-sm text-muted">
                Auf der damaligen nuLiga-Mannschaftsseite mit der rechten
                Maustaste auf <strong>„Zu Kalender hinzufügen“</strong>{" "}
                klicken → <strong>Link kopieren</strong> (beginnt mit
                webcal://… – passt so) und hier einfügen. Der Import legt
                die Spieltage mit ihrem echten Datum (inkl. Gegner und Ort)
                als Termine an – sichtbar beim Zurückblättern im Kalender.
                Danach unten <strong>„Statistik neu berechnen“</strong>{" "}
                drücken, damit die Termine-Zahlen der Teams stimmen.
              </p>
              <div className="space-y-2">
                {teams.map((t) => (
                  <AltSaisonImport key={t.id} teamId={t.id} teamName={t.name} />
                ))}
              </div>
              <form action={refreshArchivStatistik} className="border-t border-border pt-3">
                <input type="hidden" name="season_id" value={season.id} />
                <Button type="submit" variant="secondary">
                  🔄 Statistik aus den Terminen neu berechnen
                </Button>
                <p className="mt-1 text-xs text-muted">
                  Zählt Termine/Zusagen im Saison-Zeitraum{" "}
                  {season.starts_on ?? "…"} bis {season.ends_on ?? "…"} –
                  von Hand gepflegte Kader und nuLiga-Links bleiben
                  erhalten.
                </p>
              </form>
            </div>
          </details>

          {/* Team nachtragen */}
          <details className="rounded-xl border border-border bg-surface">
            <summary className="cursor-pointer px-5 py-4 font-semibold">
              ➕ Team nachtragen
            </summary>
            <form
              action={addArchivTeam}
              className="space-y-3 border-t border-border p-5"
            >
              <input type="hidden" name="season_id" value={season.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Team-Name">
                  <input
                    name="team_name"
                    required
                    placeholder="z. B. TSG 08 Roth VII"
                    className={inputClass}
                  />
                </Field>
                <Field label="Liga (optional)">
                  <input name="league" className={inputClass} />
                </Field>
              </div>
              <Button type="submit">Anlegen</Button>
              <p className="text-xs text-muted">
                Danach über „✏️ Bearbeiten“ am neuen Eintrag den Kader und
                die Statistik eintragen.
              </p>
            </form>
          </details>

          {/* Saison löschen */}
          <Card className="border-danger/40">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">Saison löschen</p>
                <p className="text-sm text-muted">
                  Entfernt die Saison samt Archiv-Einträgen, Antworten und
                  Entwürfen endgültig – z. B. wenn beim Nachtragen etwas
                  schiefging und du neu anfangen willst.
                </p>
              </div>
              <SaisonLoeschenKnopf id={season.id} name={season.name} />
            </CardBody>
          </Card>
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
              Stelle pro Pokal die Anzahl der Mannschaften ein (−/+) und
              übernimm die Leute aus den aufklappbaren Listen – ✓ = Ja,
              ~ = wenn nötig, ? = keine Antwort. Klick auf die 👑 am Chip
              ernennt den Pokal-Kapitän des Teams (nochmal = weg).
            </p>
            <div className="grid gap-4 lg:grid-cols-2">
              {POKALS.map((pokal) => (
                <PokalPlanner
                  key={pokal.kind}
                  seasonId={season.id}
                  kind={pokal.kind}
                  title={pokal.title}
                  hint={pokal.hint}
                  size={pokal.size}
                  initialTeams={
                    (pokal.kind === "ku"
                      ? season.pokal_ku_teams
                      : season.pokal_8er_teams) ?? 1
                  }
                  persons={entries.map((e) => ({
                    key: e.key,
                    name: e.name,
                    answer: e.r?.[pokal.field] ?? "",
                  }))}
                  initialSquad={squads
                    .filter((s) => s.kind === pokal.kind)
                    .map((s) => ({
                      id: s.id,
                      teamNo: s.team_no,
                      key: s.profile_id ? `p:${s.profile_id}` : `i:${s.invite_id}`,
                      captain: s.is_captain ?? false,
                    }))}
                />
              ))}
            </div>
          </section>

          {/* Mannschafts-Planung */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Mannschafts-Planung</h2>
            <p className="text-sm text-muted">
              Verschiebe die Leute per Klick zwischen den Mannschaften –
              ✓ = jedes Spiel, ~ = wenn möglich, • = nach Bedarf, ✗ = nur
              Backup, ? = keine Antwort. C! / C? = Kapitäns-Interesse,
              💬 = hat Wünsche (Maus drüber).
            </p>
            {teams.length === 0 ? (
              <EmptyState
                title="Noch keine Mannschaften angelegt"
                hint="Lege unter „Mannschaften verwalten“ zuerst die Teams an."
              />
            ) : (
              <TeamPlanner
                teams={teams.map((t) => ({
                  id: t.id,
                  name: t.name,
                  home: formatHomeMatch(
                    t.home_match_weekday,
                    t.home_match_time,
                  ),
                }))}
                persons={entries.map((e) => ({
                  key: e.key,
                  name: e.name,
                  freq: e.r?.play_frequency ?? "",
                  captain: e.r?.captain_interest ?? "",
                  wishes: e.r?.team_wishes ?? "",
                }))}
                initialAssign={entries.flatMap((e) =>
                  e.teamIds.map((teamId) => ({
                    teamId,
                    key: e.key,
                    role:
                      e.kind === "profile"
                        ? (teamRoleMap.get(`${e.id}:${teamId}`) ?? null)
                        : (inviteRoleMap.get(`${e.id}:${teamId}`) ?? null),
                  })),
                )}
              />
            )}
          </section>

          {/* Antworten */}
          <section className="space-y-3">
            <h2 className="text-lg font-bold">Antworten im Detail</h2>
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

                    {/* Aktuelle Mannschaften (Zuordnung oben in der Mannschafts-Planung) */}
                    {e.teamIds.length > 0 && (
                      <p className="border-t border-border pt-3 text-sm text-muted">
                        Mannschaft:{" "}
                        {e.teamIds
                          .map((tid) => teamById.get(tid)?.name)
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                    )}
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
