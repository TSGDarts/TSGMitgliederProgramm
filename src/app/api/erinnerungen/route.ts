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

  const zielTag = berlinDay.format(new Date(Date.now() + 7 * 864e5));

  const { data: tourData } = await admin.from("tournaments").select("*");
  const faellig = ((tourData as Tournament[]) ?? []).filter((t) => {
    const startTag = berlinDay.format(new Date(t.starts_at));
    if (startTag !== zielTag) return false;
    // Von Hand archivierte („Anzeigen bis“ vor dem Turniertag) auslassen
    return !(t.display_until && t.display_until < startTag);
  });

  // Empfänger: alle mit eingeschalteter Turnier-Erinnerung
  const { data: abonnenten } = await admin
    .from("profiles")
    .select("id")
    .eq("notify_turnier_woche", true)
    .eq("is_active", true);
  const empfaenger = (abonnenten ?? []).map((p) => p.id as string);

  let verschickt = 0;
  for (const t of faellig) {
    if (!empfaenger.length) break;
    // Doppel-Versand verhindern: Schlüssel zuerst eintragen (Primärschlüssel)
    const { error: logError } = await admin
      .from("notification_log")
      .insert({ key: `turnier7:${t.id}` });
    if (logError) continue; // gab es schon → wurde bereits verschickt

    const zeit =
      !t.details_tbd && formatTime(t.starts_at) !== "00:00"
        ? `, ${formatTime(t.starts_at)} Uhr`
        : "";
    await benachrichtige(empfaenger, {
      title: `🏟 In einer Woche: ${t.title}`,
      body: `${formatDate(t.starts_at)}${zeit}${t.location ? ` · ${t.location}` : ""}`,
      url: "/mitglieder/turniere",
    });
    verschickt++;
  }

  return NextResponse.json({
    zielTag,
    faellig: faellig.length,
    empfaenger: empfaenger.length,
    verschickt,
  });
}
