import { requireProfile } from "@/lib/auth";
import { getMemberEvents } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import {
  PageHeader,
  EmptyState,
  Card,
  CardBody,
  ButtonLink,
} from "@/components/ui";
import Link from "next/link";
import { isCompSpiegel } from "@/lib/types";
import type { Season } from "@/lib/season";

export default async function DashboardPage() {
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
    </div>
  );
}
