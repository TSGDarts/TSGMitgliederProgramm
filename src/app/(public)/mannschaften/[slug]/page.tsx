import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTeamBySlug } from "@/lib/queries";
import { NuLigaEmbed } from "@/components/NuLigaEmbed";
import { PageHeader, Card, CardBody, ButtonLink } from "@/components/ui";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  return { title: team?.name ?? "Mannschaft" };
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const team = await getTeamBySlug(slug);
  if (!team) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/mannschaften"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Mannschaften
      </Link>

      <PageHeader title={team.name} subtitle={team.league ?? undefined} />

      {team.description && (
        <Card>
          <CardBody>
            <p className="whitespace-pre-line text-muted">{team.description}</p>
          </CardBody>
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Tabelle & Spielplan (nuLiga)</h2>
        <NuLigaEmbed url={team.nuliga_url} title={`nuLiga – ${team.name}`} />
      </section>

      <Card className="bg-primary/5">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Kader, Zu-/Absagen und interne Termine findest du im
            Mitglieder-Bereich.
          </p>
          <ButtonLink href="/mitglieder" variant="secondary">
            Zum Mitglieder-Bereich
          </ButtonLink>
        </CardBody>
      </Card>
    </div>
  );
}
