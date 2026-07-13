import Link from "next/link";
import { notFound } from "next/navigation";
import { getTeamBySlug } from "@/lib/queries";
import { getTeamRoster } from "@/lib/member-queries";
import { NuLigaEmbed } from "@/components/NuLigaEmbed";
import { PageHeader, Card, CardBody, Badge, EmptyState } from "@/components/ui";

export default async function MemberTeamDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  const roster = await getTeamRoster(team.id);

  return (
    <div className="space-y-6">
      <Link
        href="/mitglieder/mannschaften"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Mannschaften
      </Link>
      <PageHeader title={team.name} subtitle={team.league ?? undefined} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Kader{" "}
          <span className="text-sm font-normal text-muted">
            ({roster.length})
          </span>
        </h2>
        {roster.length === 0 ? (
          <EmptyState
            title="Noch keine Spieler zugeordnet"
            hint="Spieler werden unter „Mannschaften verwalten“ hinzugefügt."
          />
        ) : (
          <Card>
            <CardBody className="divide-y divide-border p-0">
              {roster.map((m) => (
                <div
                  key={m.profile_id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="flex items-center gap-3">
                    {m.jersey_number != null && (
                      <span className="w-6 text-center text-sm font-bold text-muted">
                        {m.jersey_number}
                      </span>
                    )}
                    <span className="font-medium">
                      {m.profile.full_name || m.profile.email}
                    </span>
                    {m.is_captain && <Badge tone="primary">Kapitän</Badge>}
                  </div>
                  {m.profile.phone && (
                    <a
                      href={`tel:${m.profile.phone}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {m.profile.phone}
                    </a>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tabelle & Spielplan (nuLiga)</h2>
        <NuLigaEmbed url={team.nuliga_url} title={`nuLiga – ${team.name}`} />
      </section>
    </div>
  );
}
