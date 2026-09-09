import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  getMemberEvents,
  getAllTeams,
  getMatchAttendanceSummaries,
  type EventWithStatus,
} from "@/lib/member-queries";
import { siteUrl } from "@/lib/supabase/config";
import { brauchtRueckmeldung, isCompSpiegel } from "@/lib/types";
import { EventCard } from "@/components/EventCard";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { Einklappbar } from "@/components/Einklappbar";
import { PageHeader, EmptyState, ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Zu- & Absagen" };

function termineHref(
  nurLiga: boolean,
  nurOffen: boolean,
  nurKaderKnapp: boolean,
) {
  const params = new URLSearchParams();
  if (nurLiga) params.set("liga", "1");
  if (nurOffen) params.set("offen", "1");
  if (nurKaderKnapp) params.set("kader", "knapp");
  const query = params.toString();
  return query ? `/mitglieder/termine?${query}` : "/mitglieder/termine";
}

function filterSubtitle(
  nurLiga: boolean,
  nurOffen: boolean,
  nurKaderKnapp: boolean,
) {
  if (nurKaderKnapp) {
    if (nurLiga && nurOffen) {
      return "Hier siehst du knapp besetzte Ligaspiele, für die deine Rückmeldung noch fehlt.";
    }
    if (nurLiga) return "Hier siehst du nur knapp besetzte Ligaspiele.";
    if (nurOffen) {
      return "Hier siehst du knapp besetzte Spieltage, für die deine Rückmeldung noch fehlt.";
    }
    return "Hier siehst du Spieltage, bei denen der Kader noch knapp oder zu klein ist.";
  }
  if (nurLiga && nurOffen) {
    return "Hier siehst du nur Ligaspiele, die noch auf deine Rückmeldung warten.";
  }
  if (nurOffen) {
    return "Hier siehst du nur Termine, die noch auf deine Rückmeldung warten.";
  }
  if (nurLiga) return "Hier siehst du nur die anstehenden Ligaspiele.";
  return "Sag zu oder ab – für Spieltage, Freundschaftsspiele und Training (Monatsansicht unter „Kalender“ im Menü)";
}

export default async function MemberTerminePage({
  searchParams,
}: {
  searchParams: Promise<{
    liga?: string | string[];
    offen?: string | string[];
    kader?: string | string[];
  }>;
}) {
  const profile = await requireProfile();
  const teams = await getAllTeams();
  const params = await searchParams;
  const nurLiga = params.liga === "1";
  const nurOffen = params.offen === "1";
  const nurKaderKnapp = params.kader === "knapp";
  const hatFilter = nurLiga || nurOffen || nurKaderKnapp;

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          nurKaderKnapp
            ? "Kader-Check"
            : nurOffen
              ? "Offene Zu-/Absagen"
              : "Zu- & Absagen"
        }
        subtitle={filterSubtitle(nurLiga, nurOffen, nurKaderKnapp)}
        action={
          hatFilter ? (
            <ButtonLink href="/mitglieder/termine" variant="secondary">
              Alle Termine anzeigen
            </ButtonLink>
          ) : undefined
        }
      />

      <nav
        aria-label="Anstehende Termine filtern"
        className="flex flex-wrap items-center gap-2"
      >
        <span className="mr-1 text-sm font-medium text-muted">Filtern:</span>
        <ButtonLink
          href={termineHref(!nurLiga, nurOffen, nurKaderKnapp)}
          variant={nurLiga ? "primary" : "secondary"}
        >
          🎯 Nur Ligaspiele
        </ButtonLink>
        <ButtonLink
          href={termineHref(nurLiga, !nurOffen, nurKaderKnapp)}
          variant={nurOffen ? "primary" : "secondary"}
        >
          ⏳ Noch nicht abgestimmt
        </ButtonLink>
        <ButtonLink
          href={termineHref(nurLiga, nurOffen, !nurKaderKnapp)}
          variant={nurKaderKnapp ? "primary" : "secondary"}
        >
          ⚠️ Kader knapp
        </ButtonLink>
      </nav>

      <ListView
        profileId={profile.id}
        nurLiga={nurLiga}
        nurOffen={nurOffen}
        nurKaderKnapp={nurKaderKnapp}
      />

      {/* Der Rahmenterminplan hat jetzt einen eigenen Reiter im Menü */}

      <Einklappbar
        id="termine-kalender-abo"
        title="📅 Kalender-Abo fürs Handy"
        defaultOpen={false}
      >
        <p className="text-sm text-muted">
          Einmal abonnieren – neue und geänderte Termine kommen dann
          automatisch in deinen Handy-Kalender. Stell dir unten zusammen, was
          drin sein soll (z. B. nur deine Mannschaft). Geburtstage und
          interne Termine bleiben immer außen vor. Klappt der Knopf nicht,
          kopiere die Adresse und trage sie in deiner Kalender-App als
          Abo-Kalender ein.
        </p>
        <div className="mt-3">
          <CalendarSubscribe
            icsUrl={`${siteUrl}/api/kalender`}
            teams={teams.map((t) => ({ id: t.id, name: t.name }))}
          />
        </div>
      </Einklappbar>
    </div>
  );
}

async function ListView({
  profileId,
  nurLiga,
  nurOffen,
  nurKaderKnapp,
}: {
  profileId: string;
  nurLiga: boolean;
  nurOffen: boolean;
  nurKaderKnapp: boolean;
}) {
  const hatFilter = nurLiga || nurOffen || nurKaderKnapp;
  const pastPromise: Promise<EventWithStatus[]> = hatFilter
    ? Promise.resolve([])
    : getMemberEvents(profileId, { past: true, limit: 10 });
  const [allUpcoming, allPast] = await Promise.all([
    getMemberEvents(profileId),
    pastPromise,
  ]);
  const visibleUpcoming = allUpcoming
    .filter((event) => !isCompSpiegel(event))
    .filter((event) => !nurLiga || event.type === "match");
  const attendanceByEvent = await getMatchAttendanceSummaries(visibleUpcoming);
  const attendanceLoadFailed = attendanceByEvent === null;
  const past = allPast.filter((event) => !isCompSpiegel(event));
  const upcoming = visibleUpcoming
    .filter(
      (event) =>
        !nurOffen ||
        (event.myStatus === null && brauchtRueckmeldung(event)),
    )
    .filter((event) => {
      if (!nurKaderKnapp) return true;
      const attendance = attendanceByEvent?.get(event.id);
      return !!attendance && attendance.yes <= attendance.required;
    });

  // Namen der Ansprechpartner auflösen (eine Abfrage für alle Termine)
  const kontaktIds = [
    ...new Set(
      [...upcoming, ...past].flatMap((e) => e.contact_ids ?? []),
    ),
  ];
  const nameById = new Map<string, string>();
  if (kontaktIds.length) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", kontaktIds);
    for (const p of data ?? []) {
      nameById.set(p.id as string, p.full_name as string);
    }
  }
  const kontakteFuer = (e: (typeof upcoming)[number]) =>
    (e.contact_ids ?? [])
      .map((id) => nameById.get(id))
      .filter((n): n is string => !!n);

  return (
    <>
      <section>
        <h2 className="mb-3 text-lg font-bold">
          {nurKaderKnapp && nurLiga
            ? "Knappe Ligaspiele"
            : nurKaderKnapp
              ? "Spieltage mit Handlungsbedarf"
            : nurLiga && nurOffen
            ? "Offene Ligaspiele"
            : nurLiga
              ? "Anstehende Ligaspiele"
              : nurOffen
                ? "Offene Termine"
                : "Anstehend"}
        </h2>
        {upcoming.length === 0 ? (
          <EmptyState
            title={
              attendanceLoadFailed && nurKaderKnapp
                ? "Kader-Check gerade nicht verfügbar"
                : nurKaderKnapp
                ? "Keine knapp besetzten Spieltage"
                : nurLiga && nurOffen
                ? "Keine offenen Rückmeldungen zu Ligaspielen"
                : nurLiga
                  ? "Keine anstehenden Ligaspiele"
                : nurOffen
                ? "Keine offenen Rückmeldungen"
                : "Keine anstehenden Termine"
            }
            hint={
              attendanceLoadFailed && nurKaderKnapp
                ? "Bitte lade die Seite noch einmal. Deine Zu-/Absagen sind davon nicht betroffen."
                : nurKaderKnapp
                ? "Für alle berücksichtigten Spieltage gibt es bereits mehr Zusagen als benötigt."
                : nurOffen
                ? "Alles erledigt – du hast alle erforderlichen Zu-/Absagen beantwortet."
                : undefined
            }
          />
        ) : (
          <div className="space-y-3">
            {upcoming.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                contactNames={kontakteFuer(event)}
                attendance={attendanceByEvent?.get(event.id)}
              />
            ))}
          </div>
        )}
      </section>

      {!hatFilter && past.length > 0 && (
        <Einklappbar
          id="termine-vergangen"
          title={`Vergangene Termine (${past.length})`}
          defaultOpen={false}
        >
          <div className="space-y-3 opacity-70">
            {past.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                contactNames={kontakteFuer(event)}
              />
            ))}
          </div>
        </Einklappbar>
      )}
    </>
  );
}
