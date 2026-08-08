import { requireProfile } from "@/lib/auth";
import { getMemberEvents } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
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
import { brauchtRueckmeldung } from "@/lib/types";
import type { Season } from "@/lib/season";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; team?: string }>;
}) {
  const { monat, team } = await searchParams;
  const profile = await requireProfile();
  const supabase = await createClient();

  // Nur für Admins: Ablaufdatum des M365-Schlüssels (E-Mail-Versand) lesen
  const ladeSecretAblauf = async (): Promise<string> => {
    if (profile.role !== "admin") return "";
    try {
      const admin = createAdminSupabase();
      const { data } = await admin
        .from("secure_settings")
        .select("value")
        .eq("key", "graph_secret_ablauf")
        .maybeSingle();
      return ((data?.value as string) ?? "").trim();
    } catch {
      return ""; // Tabelle fehlt noch / Service-Key nicht gesetzt
    }
  };

  // Unabhängige Abfragen parallel starten (spart spürbar Ladezeit)
  const [events, openSeasonRes, ankuendigungRes, secretAblauf] =
    await Promise.all([
      getMemberEvents(profile.id, { limit: 5 }),
      supabase
        .from("seasons")
        .select("*")
        .eq("status", "active")
        .eq("survey_open", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Neueste Ankündigung (max. 14 Tage alt) vom Schwarzen Brett
      supabase
        .from("announcements")
        .select("title, body, created_at")
        .gte("created_at", new Date(Date.now() - 14 * 864e5).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      ladeSecretAblauf(),
    ]);

  // Warnung für Admins, wenn der M365-Schlüssel bald abläuft (30 Tage) –
  // gleiche Logik wie auf der Einstellungen-Seite, hier gut sichtbar oben
  let secretWarnung: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(secretAblauf)) {
    const heute = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const tageBis = Math.round(
      (Date.parse(secretAblauf) - Date.parse(heute)) / 864e5,
    );
    if (tageBis < 0) {
      secretWarnung = `Der M365-Schlüssel für den E-Mail-Versand ist am ${formatDate(secretAblauf)} abgelaufen – E-Mails gehen nicht mehr raus.`;
    } else if (tageBis <= 30) {
      secretWarnung = `Der M365-Schlüssel für den E-Mail-Versand läuft ${
        tageBis === 0 ? "HEUTE" : tageBis === 1 ? "morgen" : `in ${tageBis} Tagen`
      } ab (${formatDate(secretAblauf)}).`;
    }
  }

  // Gespiegelte Competition-Abende und Info-Termine brauchen keine Rückmeldung
  const offeneEvents = events.filter(
    (e) => e.myStatus === null && brauchtRueckmeldung(e),
  );
  const offen = offeneEvents.length;
  // Genau eine offene Rückmeldung → direkt zum Termin, sonst zur Liste
  const offenZiel =
    offen === 1
      ? `/mitglieder/termine/${offeneEvents[0].id}`
      : "/mitglieder/termine";

  // Läuft gerade eine Saisonabfrage, die ich noch nicht beantwortet habe?
  // (Mitglieder ohne Liga-Spielbetrieb betrifft sie nicht.)
  const openSeason =
    profile.role === "member"
      ? null
      : ((openSeasonRes.data as Season | null) ?? null);
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

  // Ankündigung nur zeigen, wenn die Tabelle schon existiert (Fehler egal)
  const ankuendigung = (ankuendigungRes.data ?? null) as {
    title: string;
    body: string;
  } | null;

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hallo ${profile.full_name?.split(" ")[0] || ""}!`.trim()}
        subtitle="Deine nächsten Termine und offenen Rückmeldungen"
      />

      {secretWarnung && (
        <Link href="/mitglieder/admin/einstellungen" className="block">
          <Card className="border-danger/40 bg-danger/10 transition hover:border-danger">
            <CardBody className="flex items-center justify-between gap-3 text-sm">
              <span>⚠️ {secretWarnung}</span>
              <span className="shrink-0 font-medium text-danger">
                Zu den Einstellungen →
              </span>
            </CardBody>
          </Card>
        </Link>
      )}

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
        <Link href={offenZiel} className="block">
          <Card className="border-warn/40 bg-warn/5 transition hover:border-warn">
            <CardBody className="flex items-center justify-between gap-3 text-sm">
              <span>
                Du hast noch{" "}
                <strong>
                  {offen} offene Rückmeldung{offen === 1 ? "" : "en"}
                </strong>
                . Bitte sag zu oder ab.
              </span>
              <span className="shrink-0 font-medium text-warn">
                {offen === 1 ? "Jetzt antworten →" : "Ansehen →"}
              </span>
            </CardBody>
          </Card>
        </Link>
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
