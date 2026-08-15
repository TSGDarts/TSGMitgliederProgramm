import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { getMemberEvents } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatDate, formatTime } from "@/lib/format";
import { DashboardTeamOverview } from "@/components/DashboardTeamOverview";
import {
  PageHeader,
  EmptyState,
  Card,
  CardBody,
  ButtonLink,
  Badge,
} from "@/components/ui";
import Link from "next/link";
import {
  brauchtRueckmeldung,
  EVENT_TYPE_LABELS,
  type EventRow,
} from "@/lib/types";
import {
  TOURNAMENT_KIND_LABELS,
  type Tournament,
} from "@/lib/extras";
import type { Season } from "@/lib/season";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const in14Days = new Date(now.getTime() + 14 * 864e5);
  const todayBerlin = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // Nur für Admins: Ablaufdatum des M365-Schlüssels (E-Mail-Versand) lesen
  const ladeSecretAblauf = async (): Promise<string> => {
    if (profile.role !== "admin") return "";
    try {
      const admin = createAdminSupabase();
      const { data } = await admin
        .from("secure_settings")
        .select("value")
        .eq("key", "graph_secret_ablauf")
        .maybeSingle();
      return ((data?.value as string) ?? "").trim();
    } catch {
      return ""; // Tabelle fehlt noch / Service-Key nicht gesetzt
    }
  };

  const ladeTurniere = async (): Promise<{
    data: Tournament[];
    error: boolean;
  }> => {
    const firstTry = await supabase
      .from("tournaments")
      .select("*")
      .or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`)
      .lt("starts_at", in14Days.toISOString())
      .gte("display_until", todayBerlin)
      .order("starts_at", { ascending: true });
    let data = firstTry.data;
    let loadError = firstTry.error;
    if (firstTry.error) {
      // Rückfall für Installationen, bei denen die optionale ends_at-Spalte
      // noch nicht vorhanden ist.
      ({ data, error: loadError } = await supabase
        .from("tournaments")
        .select("*")
        .gte("starts_at", nowIso)
        .lt("starts_at", in14Days.toISOString())
        .gte("display_until", todayBerlin)
        .order("starts_at", { ascending: true }));
    }
    return {
      data: (data as Tournament[] | null) ?? [],
      error: Boolean(loadError),
    };
  };

  // Unabhängige Abfragen parallel starten (spart spürbar Ladezeit)
  const [
    upcomingEvents,
    openSeasonRes,
    jerseySettingRes,
    secretAblauf,
    next14DaysRes,
    next14DaysTournamentRes,
    teamsRes,
  ] =
    await Promise.all([
      getMemberEvents(profile.id),
      supabase
        .from("seasons")
        .select("*")
        .eq("status", "active")
        .eq("survey_open", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("app_settings")
        .select("value")
        .eq("key", "jersey_survey_open")
        .maybeSingle(),
      ladeSecretAblauf(),
      supabase
        .from("events")
        .select("*")
        .or(`starts_at.gte.${nowIso},ends_at.gte.${nowIso}`)
        .lt("starts_at", in14Days.toISOString())
        .order("starts_at", { ascending: true }),
      ladeTurniere(),
      supabase.from("teams").select("id,name").order("sort_order").order("name"),
    ]);
  const jerseySurveyOpen = jerseySettingRes.data?.value === "true";

  // Warnung für Admins, wenn der M365-Schlüssel bald abläuft (30 Tage) –
  // gleiche Logik wie auf der Einstellungen-Seite, hier gut sichtbar oben
  let secretWarnung: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(secretAblauf)) {
    const heute = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const tageBis = Math.round(
      (Date.parse(secretAblauf) - Date.parse(heute)) / 864e5,
    );
    if (tageBis < 0) {
      secretWarnung = `Der M365-Schlüssel für den E-Mail-Versand ist am ${formatDate(secretAblauf)} abgelaufen – E-Mails gehen nicht mehr raus.`;
    } else if (tageBis <= 30) {
      secretWarnung = `Der M365-Schlüssel für den E-Mail-Versand läuft ${
        tageBis === 0 ? "HEUTE" : tageBis === 1 ? "morgen" : `in ${tageBis} Tagen`
      } ab (${formatDate(secretAblauf)}).`;
    }
  }

  // Gespiegelte Competition-Abende und Info-Termine brauchen keine Rückmeldung
  const offeneEvents = upcomingEvents.filter(
    (e) => e.myStatus === null && brauchtRueckmeldung(e),
  );
  const offen = offeneEvents.length;
  // Genau eine offene Rückmeldung → direkt zum Termin, sonst zur Liste
  const offenZiel =
    offen === 1
      ? `/mitglieder/termine/${offeneEvents[0].id}`
      : "/mitglieder/termine";

  // Läuft gerade eine Saisonabfrage, die ich noch nicht beantwortet habe?
  // (Mitglieder ohne Liga-Spielbetrieb betrifft sie nicht.)
  const openSeason =
    profile.role === "member"
      ? null
      : ((openSeasonRes.data as Season | null) ?? null);
  let surveyMissing = false;
  if (openSeason) {
    const { data: myAnswer } = await supabase
      .from("survey_responses")
      .select("season_id")
      .eq("season_id", openSeason.id)
      .eq("profile_id", profile.id)
      .maybeSingle();
    surveyMissing = !myAnswer;
  }

  const next14Days = [
    ...(((next14DaysRes.data as EventRow[] | null) ?? []).map((event) => ({
      kind: "event" as const,
      startsAt: event.starts_at,
      event,
    }))),
    ...next14DaysTournamentRes.data.map((tournament) => ({
      kind: "tournament" as const,
      startsAt: tournament.starts_at,
      tournament,
    })),
  ].sort(
    (a, b) =>
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
  const teamNames = new Map(
    (teamsRes.data ?? []).map((team) => [team.id as string, team.name as string]),
  );
  const next14DaysLoadError = Boolean(
    next14DaysRes.error || next14DaysTournamentRes.error,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hallo ${profile.full_name?.split(" ")[0] || ""}!`.trim()}
        subtitle="Was jetzt ansteht – Termine und Mannschaften auf einen Blick"
      />

      {secretWarnung && (
        <Link href="/mitglieder/admin/einstellungen" className="block">
          <Card className="border-danger/40 bg-danger/10 transition hover:border-danger">
            <CardBody className="flex items-center justify-between gap-3 text-sm">
              <span>⚠️ {secretWarnung}</span>
              <span className="shrink-0 font-medium text-danger">
                Zu den Einstellungen →
              </span>
            </CardBody>
          </Card>
        </Link>
      )}

      {jerseySurveyOpen && !profile.jersey_size && (
        <Link href="/mitglieder/profil#trikotgroesse" className="block">
          <Card className="border-primary/40 bg-primary/5 transition hover:border-primary">
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  👕 Welche Trikotgröße brauchst du?
                </p>
                <p className="text-sm text-muted">
                  Bitte wähle deine Größe von 2XS bis 9XL aus.
                </p>
              </div>
              <span className="shrink-0 font-medium text-primary">
                Größe auswählen →
              </span>
            </CardBody>
          </Card>
        </Link>
      )}

      {openSeason && surveyMissing && (
        <Card className="border-primary/40 bg-primary/5">
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                Saisonabfrage {openSeason.name}: Deine Meinung ist gefragt!
              </p>
              <p className="text-sm text-muted">
                Bitte beantworte die kurze Abfrage zur Mannschaftsplanung.
              </p>
            </div>
            <ButtonLink href="/mitglieder/saisonabfrage">
              Jetzt ausfüllen
            </ButtonLink>
          </CardBody>
        </Card>
      )}

      <Link href={offenZiel} className="block">
        <Card
          className={`transition ${
            offen > 0
              ? "border-warn/40 bg-warn/5 hover:border-warn"
              : "border-ok/40 bg-ok/5 hover:border-ok"
          }`}
        >
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-muted">
                Offene Zu-/Absagen
              </p>
              <p className="mt-1">
                <strong className="mr-2 text-4xl leading-none">{offen}</strong>
                <span className="text-sm text-muted">
                  {offen === 0
                    ? "Alles erledigt – keine offene Rückmeldung."
                    : `${offen === 1 ? "Termin wartet" : "Termine warten"} auf deine Rückmeldung`}
                </span>
              </p>
            </div>
            <span
              className="shrink-0 text-sm font-medium text-primary"
            >
              {offen === 1
                ? "Jetzt antworten →"
                : offen > 1
                  ? "Offene Termine ansehen →"
                  : "Zu den Zu-/Absagen →"}
            </span>
          </CardBody>
        </Card>
      </Link>

      <section id="naechste-14-tage" aria-labelledby="termine-14-tage">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 id="termine-14-tage" className="text-lg font-bold">
              Nächste 14 Tage
            </h2>
            <p className="text-sm text-muted">
              {next14Days.length} {next14Days.length === 1 ? "Termin" : "Termine"}
              {" "}im Zeitraum
            </p>
          </div>
          <Link
            href="/mitglieder/kalender"
            className="shrink-0 text-sm text-primary hover:underline"
          >
            Zum Kalender →
          </Link>
        </div>
        {next14Days.length === 0 ? (
          next14DaysLoadError ? (
            <Card className="border-warn/40 bg-warn/5">
              <CardBody className="text-sm">
                Die Termine konnten gerade nicht geladen werden. Bitte versuche
                es später noch einmal.
              </CardBody>
            </Card>
          ) : (
            <EmptyState
              title="In den nächsten 14 Tagen stehen keine Termine an"
              hint="Spätere Termine findest du weiterhin im Kalender."
            />
          )
        ) : (
          <div className="space-y-3">
            {next14DaysLoadError && (
              <Card className="border-warn/40 bg-warn/5">
                <CardBody className="py-3 text-sm">
                  Ein Teil der Termine konnte gerade nicht geladen werden.
                </CardBody>
              </Card>
            )}
            <Card>
              <CardBody className="p-0">
                <ul className="divide-y divide-border">
              {next14Days.map((item) => {
                const event = item.kind === "event" ? item.event : null;
                const tournament =
                  item.kind === "tournament" ? item.tournament : null;
                const title = event?.title || tournament?.title || "Termin";
                const location = event?.location || tournament?.location || "";
                const timeUnknown = event
                  ? Boolean(event.time_tbd)
                  : Boolean(
                      tournament?.details_tbd ||
                        formatTime(item.startsAt) === "00:00",
                    );
                return (
                  <li key={`${item.kind}-${event?.id || tournament?.id}`}>
                    <Link
                      href={
                        event
                          ? `/mitglieder/termine/${event.id}`
                          : "/mitglieder/turniere"
                      }
                      className="block px-5 py-4 transition hover:bg-border/20"
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-5">
                        <div className="shrink-0 sm:w-32">
                          <p className="text-sm font-semibold">
                            {formatDate(item.startsAt)}
                          </p>
                          <p className="text-sm text-muted">
                            {timeUnknown
                              ? "Uhrzeit folgt"
                              : `${formatTime(item.startsAt)} Uhr`}
                          </p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="primary">
                              {event
                                ? EVENT_TYPE_LABELS[event.type]
                                : "Turnier"}
                            </Badge>
                            {event ? (
                              <Badge>
                                {event.team_id
                                  ? teamNames.get(event.team_id) || "Mannschaft"
                                  : "Gesamter Verein"}
                              </Badge>
                            ) : (
                              tournament && (
                                <Badge>
                                  {TOURNAMENT_KIND_LABELS[tournament.kind]}
                                </Badge>
                              )
                            )}
                            {event?.home_away === "heim" && (
                              <Badge tone="ok">🏠 Heim</Badge>
                            )}
                            {event?.home_away === "auswaerts" && (
                              <Badge tone="warn">🚗 Auswärts</Badge>
                            )}
                          </div>
                          <p className="mt-1 font-semibold">{title}</p>
                          {location && (
                            <p className="mt-0.5 text-sm text-muted">
                              📍 {location}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  </li>
                );
              })}
                </ul>
              </CardBody>
            </Card>
          </div>
        )}
      </section>

      <Suspense
        fallback={
          <section aria-label="Mannschaften werden geladen">
            <h2 className="mb-4 text-lg font-bold">Mannschaften</h2>
            <Card>
              <CardBody className="text-sm text-muted">
                Tabellenplätze und nächste Spiele werden geladen …
              </CardBody>
            </Card>
          </section>
        }
      >
        <DashboardTeamOverview />
      </Suspense>
    </div>
  );
}
