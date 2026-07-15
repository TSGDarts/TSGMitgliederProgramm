import Link from "next/link";
import type { Metadata } from "next";
import { getAllTeams } from "@/lib/member-queries";
import { formatHomeMatch } from "@/lib/extras";
import { PageHeader, Card, CardBody, EmptyState, Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Mannschaften" };

export default async function MemberTeamsPage() {
  const teams = await getAllTeams();

  return (
    <div>
      <PageHeader
        title="Mannschaften"
        subtitle="Kader, Liga-Infos und Termine je Team"
      />
      {teams.length === 0 ? (
        <EmptyState
          title="Noch keine Mannschaften"
          hint="Mannschaften werden unter „Mannschaften verwalten“ angelegt."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => (
            <Link key={team.id} href={`/mitglieder/mannschaften/${team.slug}`}>
              <Card className="h-full transition hover:border-primary">
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{team.name}</h2>
                    {team.league && <Badge tone="primary">Liga</Badge>}
                  </div>
                  {team.league && (
                    <p className="mt-1 text-sm text-muted">{team.league}</p>
                  )}
                  {formatHomeMatch(
                    team.home_match_weekday,
                    team.home_match_time,
                  ) && (
                    <p className="mt-1 text-sm text-muted">
                      🕗 Heim:{" "}
                      {formatHomeMatch(
                        team.home_match_weekday,
                        team.home_match_time,
                      )}
                    </p>
                  )}
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
