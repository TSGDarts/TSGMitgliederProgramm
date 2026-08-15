import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader, Card, CardBody } from "@/components/ui";
import { DashboardTeamOverview } from "@/components/DashboardTeamOverview";

export const metadata: Metadata = { title: "Mannschaften" };

export default function MemberTeamsPage() {
  return (
    <div>
      <PageHeader
        title="Mannschaften"
        subtitle="Tabellenstände, nächste Spiele und Kader je Team"
      />
      <Suspense
        fallback={
          <Card>
            <CardBody className="text-sm text-muted">
              Tabellenstände und nächste Spiele werden geladen …
            </CardBody>
          </Card>
        }
      >
        <DashboardTeamOverview showHeading={false} />
      </Suspense>
    </div>
  );
}
