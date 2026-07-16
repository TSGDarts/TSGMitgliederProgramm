import { requireProfile } from "@/lib/auth";
import { getMemberEvents, getAllTeams } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { EventsCalendar } from "@/components/EventsCalendar";
import { Einklappbar } from "@/components/Einklappbar";
import {
  PageHeader,
  EmptyState,
  Card,
  CardBody,
  ButtonLink,
  Badge,
} from "@/components/ui";
import Link from "next/link";
import { formatDate, ergebnisTone } from "@/lib/format";
import { isCompSpiegel, EVENT_TYPE_LABELS, type EventRow } from "@/lib/types";
import type { Season } from "@/lib/season";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    monat?: string;
    team?: string;
    ansicht?: string;
    saison?: string;
  }>;
}) {
  const { monat, team, ansicht, saison } = await searchParams;
  const zeigeErgebnisse = ansicht === "ergebnisse";
  const profile = await requireProfile();
  const events = await getMemberEvents(profile.id, { limit: 5 });

  // Gespiegelte Competition-Abende brauchen keine Rückmeldung
  const offen = events.filter(
    (e) => e.myStatus === null && !isCompSpiegel(e),
  ).length;

  // Läuft gerade eine Saisonabfrage, die ich noch nicht beantwortet habe?
  // (Mitglieder ohne Liga-Spielbetrieb betrifft sie nicht.)
  const supabase = await createClient();
  const { data: openSeasonData } = await supabase
    .from("seasons")
    .select("*")
    .eq("status", "active")
    .eq("survey_open", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const openSeason =
    profile.role === "member" ? null : (openSeasonData as Season | null);
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

  // Ergebnis-Ansicht: ALLE Spiele je Mannschaft der gewählten Saison
  let teams: Awaited<ReturnType<typeof getAllTeams>> = [];
  const ergebnisseJeTeam = new Map<string, EventRow[]>();
  let saisons: Season[] = [];
  let gewaehlteSaison: Season | null = null;
  const archivLiga = new Map<string, string>(); // Team-Name → damalige Liga
  if (zeigeErgebnisse) {
    teams = await getAllTeams();
    const { data: saisonData } = await supabase
      .from("seasons")
      .select("*")
      .order("created_at", { ascending: false });
    saisons = (saisonData as Season[]) ?? [];
    gewaehlteSaison =
      saisons.find((s) => s.id === saison) ??
      saisons.find((s) => s.status === "active") ??
      saisons[0] ??
      null;

    let q = supabase
      .from("events")
      .select("*")
      .not("team_id", "is", null)
      .in("type", ["match", "pokal", "friendly"])
      .lte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: false });
    if (gewaehlteSaison?.starts_on) {
      q = q.gte("starts_at", gewaehlteSaison.starts_on);
    }
    if (gewaehlteSaison?.ends_on) {
      q = q.lte("starts_at", `${gewaehlteSaison.ends_on}T23:59:59Z`);
    }
    const { data: ergData } = await q;
    for (const ev of ((ergData as EventRow[]) ?? [])) {
      const list = ergebnisseJeTeam.get(ev.team_id!) ?? [];
      list.push(ev);
      ergebnisseJeTeam.set(ev.team_id!, list);
    }

    // Bei archivierten Saisons: damalige Liga aus dem Archiv anzeigen
    if (gewaehlteSaison?.status === "archived") {
      const { data: archivData } = await supabase
        .from("season_team_archive")
        .select("team_name, league")
        .eq("season_id", gewaehlteSaison.id);
      for (const a of archivData ?? []) {
        if (a.league) archivLiga.set(a.team_name as string, a.league as string);
      }
    }
  }

  /** Ergebnis mit Sieg/Niederlage/Unentschieden-Zeichen versehen. */
  const ergebnisText = (result: string): string => {
    const t = ergebnisTone(result);
    const zeichen = t === "ok" ? "✅" : t === "danger" ? "❌" : "➖";
    return `${zeichen} ${result}`;
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hallo ${profile.full_name?.split(" ")[0] || ""}!`.trim()}
        subtitle="Deine nächsten Termine und offenen Rückmeldungen"
      />

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

      {offen > 0 && (
        <Card className="border-warn/40 bg-warn/5">
          <CardBody className="text-sm">
            Du hast noch{" "}
            <strong>
              {offen} offene Rückmeldung{offen === 1 ? "" : "en"}
            </strong>
            . Bitte sag zu oder ab.
          </CardBody>
        </Card>
      )}

      {/* Reiter: Termine / Ergebnisse */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/mitglieder"
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            !zeigeErgebnisse
              ? "bg-primary text-primary-fg"
              : "border border-border text-muted hover:text-foreground"
          }`}
        >
          📅 Termine
        </Link>
        <Link
          href="/mitglieder?ansicht=ergebnisse"
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            zeigeErgebnisse
              ? "bg-primary text-primary-fg"
              : "border border-border text-muted hover:text-foreground"
          }`}
        >
          🎯 Ergebnisse
        </Link>
      </div>

      {zeigeErgebnisse ? (
        /* ============ ERGEBNISSE: alle Spiele je Mannschaft & Saison ============ */
        <section className="space-y-4">
          {/* Saison wählen */}
          {saisons.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {saisons.map((s) => (
                <Link
                  key={s.id}
                  href={`/mitglieder?ansicht=ergebnisse&saison=${s.id}`}
                  className={`rounded-full px-3 py-1 text-sm font-medium ${
                    gewaehlteSaison?.id === s.id
                      ? "bg-primary text-primary-fg"
                      : "border border-border text-muted hover:text-foreground"
                  }`}
                >
                  {s.name}
                  {s.status === "archived" ? " 🗂" : ""}
                </Link>
              ))}
            </div>
          )}
          {teams.length === 0 ? (
            <EmptyState title="Noch keine Mannschaften angelegt" />
          ) : (
            teams.map((t) => {
              const liste = ergebnisseJeTeam.get(t.id) ?? [];
              const liga = archivLiga.get(t.name) || t.league;
              return (
                <Einklappbar
                  key={t.id}
                  id={`ergebnisse-${t.id}`}
                  title={
                    <span>
                      {t.name}
                      {liga && (
                        <span className="ml-2 text-sm font-normal text-muted">
                          {liga}
                        </span>
                      )}
                      <span className="ml-2 text-sm font-normal text-muted">
                        · {liste.length} Spiele
                      </span>
                    </span>
                  }
                >
                  {liste.length === 0 ? (
                    <p className="text-sm text-muted">
                      In dieser Saison noch keine gespielten Spiele.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {liste.map((ev) => (
                        <Link
                          key={ev.id}
                          href={`/mitglieder/termine/${ev.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-border/30"
                        >
                          <span className="min-w-0">
                            <span className="text-muted">
                              {formatDate(ev.starts_at)}
                            </span>{" "}
                            {ev.title}
                            {ev.type !== "match" && (
                              <span className="ml-1 text-xs text-muted">
                                ({EVENT_TYPE_LABELS[ev.type]})
                              </span>
                            )}
                          </span>
                          {(ev.result ?? "").trim() ? (
                            <Badge tone={ergebnisTone((ev.result ?? "").trim())}>
                              {ergebnisText((ev.result ?? "").trim())}
                            </Badge>
                          ) : (
                            <Badge>Ergebnis folgt</Badge>
                          )}
                        </Link>
                      ))}
                    </div>
                  )}
                </Einklappbar>
              );
            })
          )}
        </section>
      ) : (
        /* ============ TERMINE: Kalender + nächste Termine ============ */
        <>
          <Einklappbar id="uebersicht-kalender" title="Kalender">
            <EventsCalendar base="/mitglieder" monat={monat} team={team} />
          </Einklappbar>

          <section>
            <div className="mb-4 flex items-end justify-between">
              <h2 className="text-lg font-bold">Nächste Termine</h2>
              <Link
                href="/mitglieder/termine"
                className="text-sm text-primary hover:underline"
              >
                Alle Termine →
              </Link>
            </div>
            {events.length === 0 ? (
              <EmptyState
                title="Keine anstehenden Termine"
                hint="Sobald Termine eingetragen sind, erscheinen sie hier mit Zu-/Absage."
              />
            ) : (
              <div className="space-y-3">
                {events.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
