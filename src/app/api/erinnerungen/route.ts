import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { benachrichtige } from "@/lib/benachrichtigung";
import { formatDate, formatTime } from "@/lib/format";
import type { Tournament } from "@/lib/extras";

// Täglicher Erinnerungs-Lauf (Vercel-Cron, siehe vercel.json):
// Turniere, die in genau 7 Tagen starten, an alle melden, die das im
// Profil eingeschaltet haben. Idempotent über notification_log –
// mehrfaches Aufrufen verschickt nichts doppelt.
export const dynamic = "force-dynamic";

const berlinDay = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export async function GET() {
  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return NextResponse.json({ error: "Nicht konfiguriert." }, { status: 503 });
  }

  const { data: tourData } = await admin.from("tournaments").select("*");
  const turniere = ((tourData as Tournament[]) ?? []).filter((t) => {
    const startTag = berlinDay.format(new Date(t.starts_at));
    // Von Hand archivierte („Anzeigen bis“ vor dem Turniertag) auslassen
    return !(t.display_until && t.display_until < startTag);
  });

  // Abonnenten nach ihrer gewählten Vorlaufzeit gruppieren
  const { data: abonnenten } = await admin
    .from("profiles")
    .select("id, notify_turnier_tage")
    .gt("notify_turnier_tage", 0)
    .eq("is_active", true);
  const gruppen = new Map<number, string[]>();
  for (const p of abonnenten ?? []) {
    const tage = p.notify_turnier_tage as number;
    gruppen.set(tage, [...(gruppen.get(tage) ?? []), p.id as string]);
  }

  let verschickt = 0;
  for (const [tage, empfaenger] of gruppen) {
    const zielTag = berlinDay.format(new Date(Date.now() + tage * 864e5));
    for (const t of turniere) {
      if (berlinDay.format(new Date(t.starts_at)) !== zielTag) continue;
      // Doppel-Versand verhindern: Schlüssel zuerst eintragen (Primärschlüssel)
      const { error: logError } = await admin
        .from("notification_log")
        .insert({ key: `turnier:${t.id}:${tage}` });
      if (logError) continue; // gab es schon → wurde bereits verschickt

      const zeit =
        !t.details_tbd && formatTime(t.starts_at) !== "00:00"
          ? `, ${formatTime(t.starts_at)} Uhr`
          : "";
      const wann = tage === 1 ? "Morgen" : `In ${tage} Tagen`;
      await benachrichtige(empfaenger, {
        title: `🏟 ${wann}: ${t.title}`,
        body: `${formatDate(t.starts_at)}${zeit}${t.location ? ` · ${t.location}` : ""}`,
        url: "/mitglieder/turniere",
      });
      verschickt++;
    }
  }

  return NextResponse.json({
    gruppen: gruppen.size,
    abonnenten: (abonnenten ?? []).length,
    verschickt,
  });
}
