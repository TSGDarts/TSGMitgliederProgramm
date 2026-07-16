import type { Metadata } from "next";
import { requirePlanner } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/format";
import { Einklappbar } from "@/components/Einklappbar";
import { PlanungsEntwurf } from "./PlanungsEntwurf";
import { UebernehmenKnopf } from "./UebernehmenKnopf";
import type { EntwurfZuordnung } from "./actions";
import { PageHeader, Card, CardBody, Badge, EmptyState } from "@/components/ui";
import {
  surveyLabel,
  shortLabel,
  type Season,
  type SurveyResponse,
  type SurveyAnswers,
} from "@/lib/season";
import type { Profile, Team } from "@/lib/types";

export const metadata: Metadata = { title: "Saisonplanung" };

type PlanRow = {
  id: string;
  season_id: string;
  owner_id: string;
  notes: string;
  data: { assign?: EntwurfZuordnung[] } | null;
  updated_at: string;
};

/** Ein Entwurf zum Nachlesen: Teams mit Chips, dazu die Notizen. */
function EntwurfAnsicht({
  assign,
  notes,
  teams,
  nameFor,
}: {
  assign: EntwurfZuordnung[];
  notes: string;
  teams: { id: string; name: string }[];
  nameFor: (key: string) => string;
}) {
  const proTeam = new Map<string, EntwurfZuordnung[]>();
  for (const a of assign) {
    const list = proTeam.get(a.teamId) ?? [];
    list.push(a);
    proTeam.set(a.teamId, list);
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {teams.map((t, i) => {
          const items = (proTeam.get(t.id) ?? []).sort(
            (x, y) =>
              (x.role === "captain" ? 0 : x.role === "vice" ? 1 : 2) -
                (y.role === "captain" ? 0 : y.role === "vice" ? 1 : 2) ||
              nameFor(x.key).localeCompare(nameFor(y.key)),
          );
          return (
            <div key={t.id} className="rounded-lg border border-border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">
                  <span className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg">
                    {i + 1}
                  </span>
                  {t.name}
                </span>
                <Badge>{items.length}</Badge>
              </div>
              {items.length === 0 ? (
                <p className="text-sm text-muted">–</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {items.map((a) => (
                    <span
                      key={a.key}
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${
                        a.role === "captain"
                          ? "bg-primary text-primary-fg"
                          : a.role === "vice"
                            ? "bg-primary/30 text-primary"
                            : "bg-primary/15 text-primary"
                      }`}
                    >
                      {a.role === "captain" && <span title="Kapitän">👑</span>}
                      {a.role === "vice" && (
                        <span className="text-xs font-bold" title="Vize-Kapitän">
                          VC
                        </span>
                      )}
                      {nameFor(a.key)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {notes && (
        <p className="whitespace-pre-line rounded-lg bg-border/20 px-3 py-2 text-sm">
          📝 {notes}
        </p>
      )}
    </div>
  );
}

export default async function PlanungPage() {
  const profile = await requirePlanner();
  const istAdmin = profile.role === "admin";

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title="🧠 Saisonplanung" />
        <EmptyState title="Server nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY fehlt)" />
      </div>
    );
  }

  // Aktive Saison (die neueste, falls mehrere)
  const { data: seasonData } = await admin
    .from("seasons")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const season = seasonData as Season | null;

  if (!season) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="🧠 Saisonplanung"
          subtitle="Eigene Planungs-Ideen entwerfen und vergleichen"
        />
        <EmptyState
          title="Keine aktive Saison"
          hint="Sobald der Admin eine Saison angelegt hat, kannst du hier planen."
        />
      </div>
    );
  }

  // Personen (Mitglieder + vorab angelegte Namen), Antworten, Teams, Entwürfe
  const [
    { data: profData },
    { data: invData },
    { data: teamData },
    { data: respData },
    { data: invRespData },
    planQuery,
  ] = await Promise.all([
    admin
      .from("profiles")
      .select("*")
      .eq("is_active", true)
      .neq("role", "member")
      .order("full_name"),
    admin
      .from("member_invites")
      .select("*")
      .eq("claimed", false)
      .neq("role", "member")
      .order("full_name"),
    admin.from("teams").select("*").order("sort_order"),
    admin.from("survey_responses").select("*").eq("season_id", season.id),
    admin
      .from("survey_responses_invites")
      .select("*")
      .eq("season_id", season.id),
    admin
      .from("season_plans")
      .select("*")
      .eq("season_id", season.id)
      .order("updated_at", { ascending: false }),
  ]);

  const profiles = (profData as Profile[]) ?? [];
  const invites = (invData ?? []) as Array<{ id: string; full_name: string }>;
  const teams = ((teamData as Team[]) ?? []).map((t) => ({
    id: t.id,
    name: t.name,
  }));
  const responses = new Map(
    ((respData as SurveyResponse[]) ?? []).map((r) => [r.profile_id, r]),
  );
  const inviteResponses = new Map<string, SurveyAnswers>();
  for (const r of invRespData ?? []) {
    inviteResponses.set(r.invite_id as string, r as unknown as SurveyAnswers);
  }
  const plaene = ((planQuery.data as PlanRow[]) ?? []).filter(
    (p) => p && p.season_id === season.id,
  );

  // Gemeinsame Personenliste (wie in der Admin-Planung)
  const entries = [
    ...profiles.map((p) => ({
      key: `p:${p.id}`,
      name: p.full_name || p.email || "?",
      r: responses.get(p.id) ?? null,
    })),
    ...invites.map((inv) => ({
      key: `i:${inv.id}`,
      name: inv.full_name,
      r: (inviteResponses.get(inv.id) ?? null) as SurveyAnswers | null,
    })),
  ];
  const nameByKey = new Map(entries.map((e) => [e.key, e.name]));
  const nameFor = (key: string) => nameByKey.get(key) ?? "(unbekannt)";
  const profilNameById = new Map(
    profiles.map((p) => [p.id, p.full_name || p.email || "?"]),
  );

  const persons = entries.map((e) => ({
    key: e.key,
    name: e.name,
    freq: e.r?.play_frequency ?? "",
    captain: e.r?.captain_interest ?? "",
    wishes: e.r?.team_wishes ?? "",
    ambition: e.r?.ambitions ?? "",
    sitOut: e.r?.sit_out ?? "",
    beantwortet: !!e.r,
  }));

  const eigenerPlan = plaene.find((p) => p.owner_id === profile.id) ?? null;
  const anderePlaene = plaene.filter((p) => p.owner_id !== profile.id);

  const beantwortet = entries.filter((e) => e.r).length;
  const sortiert = [...entries].sort((a, b) => {
    if (!a.r && !b.r) return a.name.localeCompare(b.name);
    if (!a.r) return 1;
    if (!b.r) return -1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="🧠 Saisonplanung"
        subtitle={`${season.name} · Jeder Planer entwirft seine eigene Idee – vergleichen, diskutieren, und am Ende übernimmt der Admin einen Entwurf.`}
      />

      {/* Eigener Entwurf */}
      <Einklappbar id="planung-eigener-entwurf" title="✏️ Mein Entwurf">
        {teams.length === 0 ? (
          <EmptyState
            title="Noch keine Mannschaften angelegt"
            hint="Der Admin muss unter „Mannschaften verwalten“ zuerst Teams anlegen."
          />
        ) : (
          <div className="space-y-4">
            <PlanungsEntwurf
              seasonId={season.id}
              teams={teams}
              persons={persons}
              initialAssign={(eigenerPlan?.data?.assign ?? []).filter(
                (a) => nameByKey.has(a.key) && teams.some((t) => t.id === a.teamId),
              )}
              initialNotes={eigenerPlan?.notes ?? ""}
            />
            {istAdmin && eigenerPlan && (
              <UebernehmenKnopf
                planId={eigenerPlan.id}
                besitzer="dir selbst"
              />
            )}
          </div>
        )}
      </Einklappbar>

      {/* Entwürfe der anderen */}
      <Einklappbar
        id="planung-andere-entwuerfe"
        title={`👀 Entwürfe der anderen Planer (${anderePlaene.length})`}
      >
        {anderePlaene.length === 0 ? (
          <p className="text-sm text-muted">
            Noch keine Entwürfe von anderen. Sobald jemand plant, siehst du
            die Idee hier – nur zum Lesen, bearbeiten kann jeder nur seinen
            eigenen Entwurf.
          </p>
        ) : (
          <div className="space-y-4">
            {anderePlaene.map((plan) => (
              <div
                key={plan.id}
                className="rounded-lg border border-border p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    📋 Entwurf von {profilNameById.get(plan.owner_id) ?? "?"}
                  </span>
                  <span className="text-xs text-muted">
                    Stand: {formatDateTime(plan.updated_at)}
                  </span>
                </div>
                <EntwurfAnsicht
                  assign={(plan.data?.assign ?? []).filter((a) =>
                    teams.some((t) => t.id === a.teamId),
                  )}
                  notes={plan.notes}
                  teams={teams}
                  nameFor={nameFor}
                />
                {istAdmin && (
                  <div className="mt-3 border-t border-border pt-3">
                    <UebernehmenKnopf
                      planId={plan.id}
                      besitzer={profilNameById.get(plan.owner_id) ?? "?"}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Einklappbar>

      {/* Antworten der Saisonabfrage – nur lesen */}
      <Einklappbar
        id="planung-antworten"
        title={`📊 Antworten der Saisonabfrage (${beantwortet}/${entries.length}, nur lesen)`}
        defaultOpen={false}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted">
            Zum Nachschlagen beim Planen – bearbeiten/nachtragen kann die
            Antworten nur der Admin (unter „Saisonplanung“ in der Verwaltung).
          </p>
          {sortiert.map((e) => (
            <Card key={e.key} className={e.r ? "" : "opacity-70"}>
              <CardBody className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{e.name}</span>
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
                      <strong className="text-foreground">Pokale:</strong> KU:{" "}
                      {shortLabel(e.r.pokal_ku)} · 8ter:{" "}
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
              </CardBody>
            </Card>
          ))}
        </div>
      </Einklappbar>
    </div>
  );
}
