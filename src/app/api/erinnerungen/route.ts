import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { benachrichtige } from "@/lib/benachrichtigung";
import { formatDate, formatTime } from "@/lib/format";
import { eventKategorie } from "@/lib/types";
import type { EventRow } from "@/lib/types";
import type { Tournament } from "@/lib/extras";

// Täglicher Erinnerungs-Lauf (Vercel-Cron, siehe vercel.json): Jedes
// Mitglied stellt im Profil je Termin-Art ein, wie viele Tage vorher es
// erinnert werden will (auch mehrfach, z. B. 14, 7 und 1 Tag). Idempotent
// über notification_log – mehrfaches Aufrufen verschickt nichts doppelt.
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

  // Abonnenten je (Kategorie, Vorlaufzeit) gruppieren
  const { data: abonnenten } = await admin
    .from("profiles")
    .select("id, notify_erinnerungen")
    .eq("is_active", true);
  const gruppen = new Map<string, Map<number, string[]>>();
  for (const p of abonnenten ?? []) {
    const konfiguration = (p.notify_erinnerungen ?? {}) as Record<
      string,
      unknown
    >;
    for (const [kategorie, tageListe] of Object.entries(konfiguration)) {
      if (!Array.isArray(tageListe)) continue;
      for (const wert of tageListe) {
        const tage = Math.round(Number(wert));
        if (!Number.isFinite(tage) || tage < 1 || tage > 30) continue;
        const proKategorie =
          gruppen.get(kategorie) ?? new Map<number, string[]>();
        proKategorie.set(tage, [
          ...(proKategorie.get(tage) ?? []),
          p.id as string,
        ]);
        gruppen.set(kategorie, proKategorie);
      }
    }
  }
  if (gruppen.size === 0) {
    return NextResponse.json({ kategorien: 0, verschickt: 0 });
  }

  const jetzt = Date.now();

  // Termine der nächsten Wochen + Turniere laden
  const { data: eventData } = await admin
    .from("events")
    .select("*")
    .gte("starts_at", new Date(jetzt - 864e5).toISOString())
    .lte("starts_at", new Date(jetzt + 31 * 864e5).toISOString());
  const events = (eventData as EventRow[]) ?? [];

  const { data: tourData } = await admin.from("tournaments").select("*");
  const turniere = ((tourData as Tournament[]) ?? []).filter(
    (t) =>
      !(
        t.display_until &&
        t.display_until < berlinDay.format(new Date(t.starts_at))
      ),
  );

  // Relevanz: Einladungsliste > Mannschafts-Kader > alle
  const { data: kaderData } = await admin
    .from("team_members")
    .select("team_id, profile_id");
  const kader = new Map<string, Set<string>>();
  for (const row of kaderData ?? []) {
    const set = kader.get(row.team_id as string) ?? new Set<string>();
    set.add(row.profile_id as string);
    kader.set(row.team_id as string, set);
  }
  const eingeladene = new Map<string, Set<string>>();
  const abgesagt = new Map<string, Set<string>>();
  if (events.length) {
    const { data: invData } = await admin
      .from("event_invitees")
      .select("event_id, profile_id")
      .in("event_id", events.map((e) => e.id));
    for (const row of invData ?? []) {
      const set = eingeladene.get(row.event_id as string) ?? new Set<string>();
      set.add(row.profile_id as string);
      eingeladene.set(row.event_id as string, set);
    }
    // Wer aktiv ABGESAGT hat, bekommt keine Erinnerung mehr
    const { data: absagen } = await admin
      .from("rsvps")
      .select("event_id, profile_id")
      .eq("status", "no")
      .in("event_id", events.map((e) => e.id));
    for (const row of absagen ?? []) {
      const set = abgesagt.get(row.event_id as string) ?? new Set<string>();
      set.add(row.profile_id as string);
      abgesagt.set(row.event_id as string, set);
    }
  }
  const relevanteEmpfaenger = (ev: EventRow, ids: string[]): string[] => {
    let kandidaten = ids;
    const invitierte = eingeladene.get(ev.id);
    if (invitierte && invitierte.size > 0) {
      kandidaten = kandidaten.filter((id) => invitierte.has(id));
    } else if (ev.team_id) {
      const k = kader.get(ev.team_id);
      kandidaten = k ? kandidaten.filter((id) => k.has(id)) : [];
    }
    const nein = abgesagt.get(ev.id);
    if (nein) kandidaten = kandidaten.filter((id) => !nein.has(id));
    return kandidaten;
  };

  let verschickt = 0;
  for (const [kategorie, proTage] of gruppen) {
    for (const [tage, ids] of proTage) {
      const zielTag = berlinDay.format(new Date(jetzt + tage * 864e5));
      const wann = tage === 1 ? "Morgen" : `In ${tage} Tagen`;

      if (kategorie === "turniere") {
        for (const t of turniere) {
          if (berlinDay.format(new Date(t.starts_at)) !== zielTag) continue;
          // Doppel-Versand verhindern (Primärschlüssel als Sperre)
          const { error: logError } = await admin
            .from("notification_log")
            .insert({ key: `turnier:${t.id}:${tage}` });
          if (logError) continue;
          const zeit =
            !t.details_tbd && formatTime(t.starts_at) !== "00:00"
              ? `, ${formatTime(t.starts_at)} Uhr`
              : "";
          await benachrichtige(ids, {
            title: `🏟 ${wann}: ${t.title}`,
            body: `${formatDate(t.starts_at)}${zeit}${t.location ? ` · ${t.location}` : ""}`,
            url: "/mitglieder/turniere",
          });
          verschickt++;
        }
        continue;
      }

      for (const ev of events) {
        if (eventKategorie(ev) !== kategorie) continue;
        if (berlinDay.format(new Date(ev.starts_at)) !== zielTag) continue;
        const empfaenger = relevanteEmpfaenger(ev, ids);
        if (empfaenger.length === 0) continue;
        const { error: logError } = await admin
          .from("notification_log")
          .insert({ key: `erinnerung:${ev.id}:${tage}` });
        if (logError) continue;
        const zeit =
          ev.time_tbd || formatTime(ev.starts_at) === "00:00"
            ? " – Uhrzeit folgt"
            : `, ${formatTime(ev.starts_at)} Uhr`;
        await benachrichtige(empfaenger, {
          title: `⏰ ${wann}: ${ev.title}`,
          body: `${formatDate(ev.starts_at)}${zeit}${ev.location ? ` · ${ev.location}` : ""}`,
          url: `/mitglieder/termine/${ev.id}`,
        });
        verschickt++;
      }
    }
  }

  return NextResponse.json({ kategorien: gruppen.size, verschickt });
}
