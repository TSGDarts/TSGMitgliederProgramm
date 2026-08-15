import Link from "next/link";
import { getAllTeams } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import {
  ladeNuligaTabelle,
  type NuligaTabelle,
  type TabellenZeile,
} from "@/lib/nuliga-tabelle";
import { formatDate, formatTime } from "@/lib/format";
import type { EventRow, Team } from "@/lib/types";
import { Badge, Card, CardBody, EmptyState } from "@/components/ui";

type NextGame = Pick<
  EventRow,
  "id" | "team_id" | "title" | "starts_at" | "time_tbd" | "home_away"
>;

function teamKey(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

function ownTableRow(
  table: NuligaTabelle | null,
  team: Team,
): TabellenZeile | null {
  if (!table) return null;
  const wanted = teamKey(team.name);
  return table.zeilen.find((row) => teamKey(row.team) === wanted) ?? null;
}

export async function DashboardTeamOverview() {
  const supabase = await createClient();
  const [teams, gamesResult] = await Promise.all([
    getAllTeams(),
    supabase
      .from("events")
      .select("id,team_id,title,starts_at,time_tbd,home_away")
      .not("team_id", "is", null)
      .in("type", ["match", "pokal", "friendly"])
      .gte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: true }),
  ]);

  if (teams.length === 0) {
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
    if (game.team_id && !nextGameByTeam.has(game.team_id)) {
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

      <div className="grid gap-4 lg:grid-cols-2">
        {teams.map((team, index) => {
          const table = teamTables[index];
          const row = ownTableRow(table, team);
          const standing =
            row && Number.parseInt(row.begegnungen, 10) > 0 ? row : null;
          const nextGame = nextGameByTeam.get(team.id);
          return (
            <Card key={team.id} className="h-full">
              <CardBody className="flex h-full flex-col gap-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3>
                      <Link
                        href={`/mitglieder/mannschaften/${team.slug}`}
                        className="font-semibold hover:text-primary"
                      >
                        {team.name}
                      </Link>
                    </h3>
                    {team.league && (
                      <p className="mt-0.5 text-sm text-muted">{team.league}</p>
                    )}
                  </div>
                  {standing ? (
                    <Badge tone="primary">
                      Platz {standing.rang} von {table?.zeilen.length}
                    </Badge>
                  ) : row ? (
                    <Badge>Saison noch nicht gestartet</Badge>
                  ) : (
                    <Badge>Platz nicht verfügbar</Badge>
                  )}
                </div>

                <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-[9rem_1fr]">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Tabelle
                    </p>
                    {standing ? (
                      <>
                        <p className="mt-1 text-2xl font-bold">
                          Platz {standing.rang}
                        </p>
                        <p className="text-sm text-muted">
                          {standing.punkte} Punkte
                        </p>
                      </>
                    ) : row ? (
                      <p className="mt-1 text-sm text-muted">
                        Noch kein Spiel gewertet
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">
                        Derzeit nicht verfügbar
                      </p>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      Nächstes Spiel
                    </p>
                    {nextGame ? (
                      <>
                        <Link
                          href={`/mitglieder/termine/${nextGame.id}`}
                          className="mt-1 block font-medium hover:text-primary"
                        >
                          {nextGame.title}
                        </Link>
                        <p className="mt-1 text-sm text-muted">
                          {formatDate(nextGame.starts_at)} ·{" "}
                          {nextGame.time_tbd
                            ? "Uhrzeit folgt"
                            : `${formatTime(nextGame.starts_at)} Uhr`}
                        </p>
                        {nextGame.home_away === "heim" && (
                          <Badge tone="ok">🏠 Heim</Badge>
                        )}
                        {nextGame.home_away === "auswaerts" && (
                          <Badge tone="warn">🚗 Auswärts</Badge>
                        )}
                      </>
                    ) : gamesResult.error ? (
                      <p className="mt-1 text-sm text-muted">
                        Derzeit nicht verfügbar
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-muted">
                        Noch kein Spiel eingetragen
                      </p>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
