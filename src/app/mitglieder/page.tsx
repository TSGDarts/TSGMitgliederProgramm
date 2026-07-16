import { requireProfile } from "@/lib/auth";
import { getMemberEvents } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import { EventCard } from "@/components/EventCard";
import { EventsCalendar } from "@/components/EventsCalendar";
import { Einklappbar } from "@/components/Einklappbar";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; team?: string }>;
}) {
  const { monat, team } = await searchParams;
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

  // Neueste Ankündigung (max. 14 Tage alt) vom Schwarzen Brett
  let ankuendigung: { title: string; body: string } | null = null;
  try {
    const { data } = await supabase
      .from("announcements")
      .select("title, body, created_at")
      .gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) ankuendigung = data as { title: string; body: string };
  } catch {
    // Tabelle fehlt noch – kein Hinweis
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

      {ankuendigung && (
        <Card className="border-primary/40 bg-primary/5">
          <CardBody className="text-sm">
            <Link href="/mitglieder/brett" className="hover:underline">
              <span className="font-semibold">📢 {ankuendigung.title}</span>
              {ankuendigung.body && (
                <span className="mt-1 block text-muted">
                  {ankuendigung.body.length > 140
                    ? `${ankuendigung.body.slice(0, 140)} …`
                    : ankuendigung.body}
                </span>
              )}
              <span className="mt-1 block text-xs text-primary">
                Zum Schwarzen Brett →
              </span>
            </Link>
          </CardBody>
        </Card>
      )}

      <Einklappbar id="uebersicht-kalender" title="🗓️ Kalender">
        <EventsCalendar base="/mitglieder" monat={monat} team={team} />
      </Einklappbar>

      <section>
        <div className="mb-4 flex items-end justify-between">
          <h2 className="text-lg font-bold">Nächste Termine – zu-/absagen</h2>
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
