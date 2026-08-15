import Link from "next/link";
import { getAllTeams } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import {
  ladeNuligaTabelle,
  type NuligaTabelle,
  type TabellenZeile,
} from "@/lib/nuliga-tabelle";
import { formatDate, formatTime } from "@/lib/format";
import { formatHomeMatch, romanTeamNo } from "@/lib/extras";
import { berlinOffset } from "@/lib/tz";
import {
  cleanNuligaEventTitle,
  parseNuligaMatch,
} from "@/lib/nuliga-opponents";
import type { EventRow, Team } from "@/lib/types";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui";

type NextGame = Pick<
  EventRow,
  | "id"
  | "team_id"
  | "title"
  | "description"
  | "starts_at"
  | "time_tbd"
  | "home_away"
  | "opponent_team_no"
> & {
  opponent: { name: string } | { name: string }[] | null;
};

function teamKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function ownTableIndex(
  table: NuligaTabelle | null,
  team: Team,
): number {
  if (!table) return -1;
  const wanted = teamKey(team.name);
  return table.zeilen.findIndex((row) => teamKey(row.team) === wanted);
}

function tableExcerpt(
  table: NuligaTabelle,
  ownIndex: number,
): TabellenZeile[] {
  const count = Math.min(3, table.zeilen.length);
  const start = Math.max(
    0,
    Math.min(ownIndex - 1, table.zeilen.length - count),
  );
  return table.zeilen.slice(start, start + count);
}

function relationName(
  relation: NextGame["opponent"],
): string {
  if (Array.isArray(relation)) return relation[0]?.name?.trim() ?? "";
  return relation?.name?.trim() ?? "";
}

function opponentLabel(game: NextGame, team: Team): string | null {
  let name = relationName(game.opponent);
  let teamNo = game.opponent_team_no;
  if (!name || teamNo == null) {
    const parsed = parseNuligaMatch(
      {
        summary: game.title,
        description: game.description ?? "",
        location: "",
      },
      team.name,
      team.league ?? "",
    );
    if (!name) name = parsed?.opponentName ?? "";
    if (teamNo == null) teamNo = parsed?.opponentTeamNo ?? teamNo;
  }
  if (!name) {
    return null;
  }
  const suffix = romanTeamNo(teamNo);
  if (!suffix || name.toLocaleUpperCase("de-DE").endsWith(` ${suffix}`)) {
    return name;
  }
  return `${name} ${suffix}`;
}

export async function DashboardTeamOverview({
  showHeading = true,
}: {
  showHeading?: boolean;
} = {}) {
  const supabase = await createClient();
  const now = new Date();
  const nowMs = now.getTime();
  const berlinDay = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const todayBerlin = berlinDay.format(now);
  const [year, month, day] = todayBerlin.split("-").map(Number);
  const todayStartIso = `${todayBerlin}T00:00:00${berlinOffset(year, month, day)}`;
  const [teams, gamesResult] = await Promise.all([
    getAllTeams(),
    supabase
      .from("events")
      .select(
        "id,team_id,title,description,starts_at,time_tbd,home_away,opponent_team_no,opponent:opponents(name)",
      )
      .not("team_id", "is", null)
      .in("type", ["match", "pokal", "friendly"])
      .gte("starts_at", todayStartIso)
      .order("starts_at", { ascending: true }),
  ]);

  if (teams.length === 0) {
    if (!showHeading) {
      return <EmptyState title="Noch keine Mannschaften angelegt" />;
    }
    return (
      <section aria-labelledby="dashboard-mannschaften">
        <h2 id="dashboard-mannschaften" className="mb-4 text-lg font-bold">
          Mannschaften
        </h2>
        <EmptyState title="Noch keine Mannschaften angelegt" />
      </section>
    );
  }

  const nextGameByTeam = new Map<string, NextGame>();
  for (const game of (gamesResult.data ?? []) as NextGame[]) {
    const startsAt = new Date(game.starts_at).getTime();
    const isToday = berlinDay.format(new Date(game.starts_at)) === todayBerlin;
    const isUpcoming = startsAt >= nowMs || (game.time_tbd && isToday);
    if (
      isUpcoming &&
      game.team_id &&
      !nextGameByTeam.has(game.team_id)
    ) {
      nextGameByTeam.set(game.team_id, game);
    }
  }

  // Mehrere Teams können dieselbe Tabelle verwenden. Jede URL nur einmal laden.
  const tableRequests = new Map<string, Promise<NuligaTabelle | null>>();
  const loadTable = (url: string) => {
    if (!tableRequests.has(url)) {
      tableRequests.set(url, ladeNuligaTabelle(url));
    }
    return tableRequests.get(url)!;
  };
  const teamTables = await Promise.all(
    teams.map(async (team) => {
      const url = (team.nuliga_table_url || team.nuliga_url || "").trim();
      return url ? loadTable(url) : null;
    }),
  );
  const CardHeading = showHeading ? "h3" : "h2";

  const cards = (
    <div className="grid gap-4 lg:grid-cols-2">
      {teams.map((team, index) => {
        const table = teamTables[index];
        const ownIndex = ownTableIndex(table, team);
        const row = table && ownIndex >= 0 ? table.zeilen[ownIndex] : null;
        const played = row ? Number.parseInt(row.begegnungen, 10) : Number.NaN;
        const standing = row && Number.isFinite(played) && played > 0 ? row : null;
        const seasonNotStarted = Boolean(row && played === 0);
        const excerpt =
          table && standing ? tableExcerpt(table, ownIndex) : [];
        const nextGame = nextGameByTeam.get(team.id);
        const opponent = nextGame ? opponentLabel(nextGame, team) : null;
        const homeMatch = formatHomeMatch(
          team.home_match_weekday,
          team.home_match_time,
        );

        return (
          <Card key={team.id} className="h-full">
            <CardBody className="flex h-full flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardHeading>
                    <Link
                      href={`/mitglieder/mannschaften/${team.slug}`}
                      className="font-semibold hover:text-primary"
                    >
                      {team.name}
                    </Link>
                  </CardHeading>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                    {team.league && <span>{team.league}</span>}
                    {homeMatch && <span>🕗 Heim: {homeMatch}</span>}
                  </div>
                </div>
                {standing ? (
                  <Badge tone="primary">
                    Platz {standing.rang} von {table?.zeilen.length}
                  </Badge>
                ) : seasonNotStarted ? (
                  <Badge>Saison noch nicht gestartet</Badge>
                ) : (
                  <Badge>Platz nicht verfügbar</Badge>
                )}
              </div>

              <div className="grid flex-1 gap-5 border-t border-border pt-4">
                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Tabellenausschnitt
                  </p>
                  {excerpt.length > 0 ? (
                    <table className="w-full table-fixed text-sm">
                      <caption className="sr-only">
                        Tabellenausschnitt für {team.name}
                      </caption>
                      <colgroup>
                        <col className="w-12" />
                        <col />
                        <col className="w-9" />
                        <col className="w-12" />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-border text-xs text-muted">
                          <th scope="col" className="py-1 text-left">#</th>
                          <th scope="col" className="py-1 text-left">Team</th>
                          <th scope="col" className="py-1 text-center">Sp.</th>
                          <th scope="col" className="py-1 text-right">Pkt.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {excerpt.map((tableRow) => {
                          const own = teamKey(tableRow.team) === teamKey(team.name);
                          return (
                            <tr
                              key={`${tableRow.rang}-${tableRow.team}`}
                              className={`border-b border-border/50 ${
                                own ? "bg-primary/10 font-semibold" : ""
                              }`}
                            >
                              <td className="py-1.5 text-muted">
                                {tableRow.rang}
                                {tableRow.status === "Aufsteiger" && (
                                  <span title="Aufstiegsplatz" className="ml-1 text-ok">
                                    ▲<span className="sr-only"> Aufstiegsplatz</span>
                                  </span>
                                )}
                                {tableRow.status === "Absteiger" && (
                                  <span title="Abstiegsplatz" className="ml-1 text-danger">
                                    ▼<span className="sr-only"> Abstiegsplatz</span>
                                  </span>
                                )}
                              </td>
                              <th
                                scope="row"
                                className={`break-words py-1.5 pr-1 text-left ${
                                  own ? "font-semibold" : "font-normal"
                                }`}
                              >
                                {tableRow.team}
                              </th>
                              <td className="py-1.5 text-center text-muted">
                                {tableRow.begegnungen}
                              </td>
                              <td className="py-1.5 text-right font-medium">
                                {tableRow.punkte}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : seasonNotStarted ? (
                    <p className="text-sm text-muted">Noch kein Spiel gewertet</p>
                  ) : (
                    <p className="text-sm text-muted">Derzeit nicht verfügbar</p>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Nächstes Spiel
                  </p>
                  {nextGame ? (
                    <>
                      <p className="font-medium">
                        {formatDate(nextGame.starts_at)} ·{" "}
                        {nextGame.time_tbd
                          ? "Uhrzeit folgt"
                          : `${formatTime(nextGame.starts_at)} Uhr`}
                      </p>
                      <Link
                        href={`/mitglieder/termine/${nextGame.id}`}
                        className="mt-1 block text-sm font-medium text-primary hover:underline"
                      >
                        {opponent
                          ? `gegen ${opponent}`
                          : cleanNuligaEventTitle({
                              summary: nextGame.title,
                              description: nextGame.description,
                            })}
                      </Link>
                      <div className="mt-2">
                        {nextGame.home_away === "heim" && (
                          <Badge tone="ok">🏠 Heim</Badge>
                        )}
                        {nextGame.home_away === "auswaerts" && (
                          <Badge tone="warn">🚗 Auswärts</Badge>
                        )}
                      </div>
                    </>
                  ) : gamesResult.error ? (
                    <p className="text-sm text-muted">Derzeit nicht verfügbar</p>
                  ) : (
                    <p className="text-sm text-muted">
                      Noch kein Spiel eingetragen
                    </p>
                  )}
                </div>
              </div>
              <div className="border-t border-border pt-3 text-right">
                <Link
                  href={`/mitglieder/mannschaften/${team.slug}`}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Mannschaft &amp; Kader ansehen →
                </Link>
              </div>
            </CardBody>
          </Card>
        );
      })}
    </div>
  );

  if (!showHeading) return cards;

  return (
    <section aria-labelledby="dashboard-mannschaften">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <h2 id="dashboard-mannschaften" className="text-lg font-bold">
            Mannschaften
          </h2>
          <p className="text-sm text-muted">
            Aktueller Tabellenplatz und nächstes Spiel
          </p>
        </div>
        <Link
          href="/mitglieder/mannschaften"
          className="shrink-0 text-sm text-primary hover:underline"
        >
          Alle Mannschaften →
        </Link>
      </div>
      {cards}
    </section>
  );
}
