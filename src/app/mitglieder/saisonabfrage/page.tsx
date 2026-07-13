import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SurveyForm } from "./SurveyForm";
import { PageHeader, Card, CardBody, EmptyState, Badge } from "@/components/ui";
import type { Season, SurveyResponse } from "@/lib/season";

export const metadata: Metadata = { title: "Saisonabfrage" };

export default async function SaisonabfragePage() {
  const profile = await requireProfile();

  // Mitglieder ohne Liga-Spielbetrieb betrifft die Abfrage nicht.
  if (profile.role === "member") {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader
          title="Saisonabfrage"
          subtitle="Deine Rückmeldung für die Mannschaftsplanung"
        />
        <EmptyState
          title="Die Saisonabfrage richtet sich an Liga-Spieler"
          hint="Du bist als Mitglied ohne Liga-Spielbetrieb eingetragen. Falls du doch Liga spielen möchtest, melde dich beim Vereins-Admin."
        />
      </div>
    );
  }

  const supabase = await createClient();

  // Aktuell offene Abfrage (neueste zuerst)
  const { data: seasonData } = await supabase
    .from("seasons")
    .select("*")
    .eq("status", "active")
    .eq("survey_open", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const season = seasonData as Season | null;

  let existing: SurveyResponse | null = null;
  if (season) {
    const { data } = await supabase
      .from("survey_responses")
      .select("*")
      .eq("season_id", season.id)
      .eq("profile_id", profile.id)
      .maybeSingle();
    existing = data as SurveyResponse | null;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Saisonabfrage"
        subtitle="Deine Rückmeldung für die Mannschaftsplanung"
      />

      {!season ? (
        <EmptyState
          title="Zurzeit läuft keine Saisonabfrage"
          hint="Sobald der Verein eine Abfrage startet, kannst du sie hier ausfüllen."
        />
      ) : (
        <>
          <Card className="bg-primary/5">
            <CardBody className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold">{season.name}</span>
                <p className="text-sm text-muted">
                  Deine Antworten helfen bei der Aufteilung der Mannschaften.
                </p>
              </div>
              {existing ? (
                <Badge tone="ok">bereits beantwortet – änderbar</Badge>
              ) : (
                <Badge tone="warn">noch offen</Badge>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <SurveyForm seasonId={season.id} existing={existing} />
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
