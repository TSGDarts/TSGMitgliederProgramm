import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { EventsCalendar } from "@/components/EventsCalendar";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Kalender" };

export default async function KalenderPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; team?: string }>;
}) {
  const { monat, team } = await searchParams;
  await requireProfile();

  return (
    <div className="space-y-6">
      <PageHeader
        title="🗓️ Kalender"
        subtitle="Alle Termine im Monatsblick – Termin antippen für Zu-/Absage"
      />
      <EventsCalendar base="/mitglieder/kalender" monat={monat} team={team} />
    </div>
  );
}
