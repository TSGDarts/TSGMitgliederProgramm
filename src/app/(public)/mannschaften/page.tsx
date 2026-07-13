import Link from "next/link";
import type { Metadata } from "next";
import { getTeams } from "@/lib/queries";
import { Card, CardBody, EmptyState, PageHeader, Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Mannschaften" };

export default async function MannschaftenPage() {
  const teams = await getTeams();

  return (
    <div>
      <PageHeader
        title="Mannschaften"
        subtitle="Unsere Teams im Spielbetrieb"
      />
      {teams.length === 0 ? (
        <EmptyState
          title="Noch keine Mannschaften angelegt"
          hint="Die Mannschaften werden im Verwaltungsbereich angelegt."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link key={team.id} href={`/mannschaften/${team.slug}`}>
              <Card className="h-full transition hover:border-primary">
                <CardBody>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">{team.name}</h2>
                    {team.league && <Badge tone="primary">Liga</Badge>}
                  </div>
                  {team.league && (
                    <p className="mt-1 text-sm text-muted">{team.league}</p>
                  )}
                  {team.description && (
                    <p className="mt-2 line-clamp-3 text-sm text-muted">
                      {team.description}
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
