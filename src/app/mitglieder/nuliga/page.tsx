import type { Metadata } from "next";
import Link from "next/link";
import { getAllTeams } from "@/lib/member-queries";
import { site } from "@/lib/site";
import { PageHeader, Card, CardBody, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "nuLiga" };

export default async function NuLigaPage() {
  const teams = await getAllTeams();
  const withNuliga = teams.filter((t) => t.nuliga_url);

  return (
    <div className="space-y-6">
      <PageHeader
        title="nuLiga"
        subtitle="Tabellen und Spielpläne aus der Ligaverwaltung"
      />

      <Card className="bg-primary/5">
        <CardBody className="text-sm text-muted">
          Die Spieltermine aus nuLiga landen über den iCal-Import automatisch im{" "}
          <Link href="/mitglieder/termine" className="text-primary hover:underline">
            Terminkalender
          </Link>
          . Tabellen und Spielpläne siehst du hier bzw. auf der jeweiligen
          Mannschaftsseite.{" "}
          <a
            href={site.nuligaPortalUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            nuLiga-Portal öffnen →
          </a>
        </CardBody>
      </Card>

      {withNuliga.length === 0 ? (
        <EmptyState
          title="Noch keine nuLiga-Verknüpfung"
          hint="Trage die nuLiga-Adressen unter „Mannschaften verwalten“ ein."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {withNuliga.map((team) => (
            <Card key={team.id}>
              <CardBody className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{team.name}</div>
                  {team.league && (
                    <div className="text-sm text-muted">{team.league}</div>
                  )}
                </div>
                <Link
                  href={`/mitglieder/mannschaften/${team.slug}`}
                  className="text-sm text-primary hover:underline"
                >
                  Tabelle ansehen →
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
