import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMemberEvents, getAllTeams } from "@/lib/member-queries";
import { siteUrl } from "@/lib/supabase/config";
import { EventCard } from "@/components/EventCard";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { Einklappbar } from "@/components/Einklappbar";
import { PdfPan } from "@/components/PdfPan";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Termine & Zusagen" };

export default async function MemberTerminePage() {
  const profile = await requireProfile();
  const teams = await getAllTeams();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Termine & Zusagen"
        subtitle="Sag zu oder ab – für Spieltage, Freundschaftsspiele und Training (Monatsansicht unter „Kalender“ im Menü)"
      />

      <ListView profileId={profile.id} />

      <Einklappbar
        id="termine-rahmenterminplan"
        title="📄 Rahmenterminplan 2026/27 & 2027/28"
        defaultOpen={false}
      >
        <p className="mb-3 text-sm text-muted">
          Der offizielle Rahmenterminplan (Mittelfranken / BDV / DDV) – die
          Spielwochen stehen auch oben im Kalender.
        </p>
        <PdfPan
          src="/rahmenterminplan.pdf"
          titel="Rahmenterminplan 2026/27 & 2027/28"
          seiten={2}
        />
      </Einklappbar>

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

async function ListView({ profileId }: { profileId: string }) {
  const [upcoming, past] = await Promise.all([
    getMemberEvents(profileId),
    getMemberEvents(profileId, { past: true, limit: 10 }),
  ]);

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
        <h2 className="mb-3 text-lg font-bold">Anstehend</h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Keine anstehenden Termine" />
        ) : (
          <div className="space-y-3">
            {upcoming.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                contactNames={kontakteFuer(event)}
              />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
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
