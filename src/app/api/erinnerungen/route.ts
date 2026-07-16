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
    .select("*")
    .eq("is_active", true);
  // Erinnerung je nach eigener Antwort: Standard = bei Zusage und
  // „Vielleicht“ erinnern, nach Absage nicht (drei Haken im Profil)
  const trotzAbsage = new Set(
    (abonnenten ?? [])
      .filter((p) => p.notify_trotz_absage)
      .map((p) => p.id as string),
  );
  const ohneZusageErinnerung = new Set(
    (abonnenten ?? [])
      .filter((p) => p.notify_trotz_zusage === false)
      .map((p) => p.id as string),
  );
  const ohneVielleichtErinnerung = new Set(
    (abonnenten ?? [])
      .filter((p) => p.notify_trotz_vielleicht === false)
      .map((p) => p.id as string),
  );
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
  let verschickt = 0;

  // Ablauf des M365-Schlüssels überwachen: Admins 30/14/7/3/1 Tage vorher
  // (und einmalig nach Ablauf) benachrichtigen – Datum pflegt der Admin
  // unter Einstellungen („Schlüssel gültig bis“). Läuft bewusst VOR dem
  // Abbruch bei leeren Erinnerungs-Gruppen.
  try {
    const { data: ablaufRow } = await admin
      .from("secure_settings")
      .select("value")
      .eq("key", "graph_secret_ablauf")
      .maybeSingle();
    const ablauf = ((ablaufRow?.value as string) ?? "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(ablauf)) {
      const heute = berlinDay.format(new Date());
      const tageBis = Math.round(
        (Date.parse(ablauf) - Date.parse(heute)) / 864e5,
      );
      const stufe = [30, 14, 7, 3, 1, 0].includes(tageBis)
        ? String(tageBis)
        : tageBis < 0
          ? "abgelaufen"
          : null;
      if (stufe) {
        const { error: logError } = await admin
          .from("notification_log")
          .insert({ key: `graph-ablauf:${ablauf}:${stufe}` });
        if (!logError) {
          const { data: adminProfile } = await admin
            .from("profiles")
            .select("id")
            .eq("role", "admin")
            .eq("is_active", true);
          const adminIds = (adminProfile ?? []).map((p) => p.id as string);
          if (adminIds.length) {
            const wann =
              tageBis < 0
                ? "ist ABGELAUFEN"
                : tageBis === 0
                  ? "läuft HEUTE ab"
                  : tageBis === 1
                    ? "läuft MORGEN ab"
                    : `läuft in ${tageBis} Tagen ab`;
            await benachrichtige(adminIds, {
              title: `🔑 M365-Schlüssel ${wann}`,
              body: `Der geheime Clientschlüssel für den E-Mail-Versand (gültig bis ${formatDate(ablauf)}) muss in Microsoft Entra erneuert und unter Einstellungen neu eingetragen werden.`,
              url: "/mitglieder/admin/einstellungen",
            });
            verschickt++;
          }
        }
      }
    }
  } catch {
    // secure_settings fehlt noch – dann gibt es nichts zu überwachen
  }

  // Austritte vollziehen: Mitglieder mit erreichtem Austrittsdatum
  // deaktivieren (Login sperren) – sie wandern damit automatisch zu
  // „Ehemalige Mitglieder“. Admins werden einmalig informiert.
  try {
    const heute = berlinDay.format(new Date());
    const { data: austritte } = await admin
      .from("profiles")
      .select("id, full_name, left_on")
      .eq("is_active", true)
      .not("left_on", "is", null)
      .lte("left_on", heute);
    for (const p of austritte ?? []) {
      await admin.auth.admin.updateUserById(p.id as string, {
        ban_duration: "87600h",
      });
      await admin
        .from("profiles")
        .update({ is_active: false })
        .eq("id", p.id);
      const { error: logError } = await admin
        .from("notification_log")
        .insert({ key: `austritt:${p.id}:${p.left_on}` });
      if (!logError) {
        const { data: adminProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("role", "admin")
          .eq("is_active", true);
        const adminIds = (adminProfile ?? []).map((x) => x.id as string);
        if (adminIds.length) {
          await benachrichtige(adminIds, {
            title: `👋 Austritt vollzogen: ${p.full_name}`,
            body: `${p.full_name} ist zum ${formatDate(p.left_on as string)} ausgetreten und wurde deaktiviert (unter „Ehemalige Mitglieder“ wieder aktivierbar).`,
            url: "/mitglieder/admin/mitglieder",
          });
          verschickt++;
        }
      }
    }
  } catch {
    // Spalte fehlt noch (ALLE_ERWEITERUNGEN nicht ausgeführt) – überspringen
  }

  // Geburtstags-Gruß: „Heute hat X Geburtstag“ an alle – nur wenn die
  // Person der Gratulation in der Mitgliedergruppe zugestimmt hat.
  try {
    const heute = berlinDay.format(new Date());
    const { data: kinder } = await admin
      .from("profiles")
      .select("id, full_name, birthday")
      .eq("is_active", true)
      .eq("birthday_congrats", true)
      .not("birthday", "is", null);
    for (const p of kinder ?? []) {
      if ((p.birthday as string).slice(5) !== heute.slice(5)) continue;
      const { error: logError } = await admin
        .from("notification_log")
        .insert({ key: `geburtstag:${p.id}:${heute.slice(0, 4)}` });
      if (logError) continue;
      const alter =
        Number(heute.slice(0, 4)) - Number((p.birthday as string).slice(0, 4));
      const { data: alle } = await admin
        .from("profiles")
        .select("id")
        .eq("is_active", true)
        .neq("id", p.id);
      await benachrichtige((alle ?? []).map((x) => x.id as string), {
        title: `🎂 ${p.full_name} hat heute Geburtstag!`,
        body: `${p.full_name} wird heute ${alter} – gratuliert fleißig! 🎉`,
        url: "/mitglieder",
      });
      verschickt++;
    }
  } catch {
    // best-effort
  }

  if (gruppen.size === 0) {
    return NextResponse.json({ kategorien: 0, verschickt });
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
  const antworten = new Map<string, Map<string, string>>();
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
    // Bereits gegebene Antworten (Zusage/Vielleicht/Absage) je Termin
    const { data: rsvpData } = await admin
      .from("rsvps")
      .select("event_id, profile_id, status")
      .in("event_id", events.map((e) => e.id));
    for (const row of rsvpData ?? []) {
      const map =
        antworten.get(row.event_id as string) ?? new Map<string, string>();
      map.set(row.profile_id as string, row.status as string);
      antworten.set(row.event_id as string, map);
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
    // Wer schon geantwortet hat, wird nur erinnert, wenn der passende
    // Haken im Profil gesetzt ist; ohne Antwort wird immer erinnert.
    const status = antworten.get(ev.id);
    if (status) {
      kandidaten = kandidaten.filter((id) => {
        const antwort = status.get(id);
        if (antwort === "no") return trotzAbsage.has(id);
        if (antwort === "yes") return !ohneZusageErinnerung.has(id);
        if (antwort === "maybe") return !ohneVielleichtErinnerung.has(id);
        return true;
      });
    }
    return kandidaten;
  };

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
