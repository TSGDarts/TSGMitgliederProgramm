import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getAllTeams } from "@/lib/member-queries";
import { siteUrl } from "@/lib/supabase/config";
import { EventsCalendar } from "@/components/EventsCalendar";
import { CalendarSubscribe } from "@/components/CalendarSubscribe";
import { Einklappbar } from "@/components/Einklappbar";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Kalender" };

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; team?: string }>;
}) {
  const { monat, team } = await searchParams;
  await requireProfile();
  const teams = await getAllTeams();

  return (
    <div className="space-y-6">
      <PageHeader
        title="🗓️ Kalender"
        subtitle="Alle Termine im Monatsblick – Termin antippen für Zu-/Absage"
      />
      <EventsCalendar base="/mitglieder/kalender" monat={monat} team={team} />

      {/* Gleiche Abo-Box wie auf „Zu- & Absagen“ – bewusst an beiden Stellen */}
      <Einklappbar
        id="kalender-kalender-abo"
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
