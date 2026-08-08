"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import {
  getEventParticipants,
  getManageableTeamIds,
} from "@/lib/member-queries";
import { benachrichtige } from "@/lib/benachrichtigung";
import { formatDate, formatTime } from "@/lib/format";
import { brauchtRueckmeldung, type EventRow, type RsvpStatus } from "@/lib/types";

export async function setRsvp(
  eventId: string,
  status: RsvpStatus,
  comment?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const row: Record<string, unknown> = {
    event_id: eventId,
    profile_id: user.id,
    status,
    updated_at: new Date().toISOString(),
  };
  if (comment !== undefined) row.comment = comment.trim();

  const { error } = await supabase
    .from("rsvps")
    .upsert(row, { onConflict: "event_id,profile_id" });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/mitglieder");
  revalidatePath("/mitglieder/termine");
  revalidatePath(`/mitglieder/termine/${eventId}`);
  return { ok: true };
}

/**
 * „Erinnerung an alle ohne Antwort senden“ (Kapitän/Vize/Bearbeiter/Admin
 * auf der Termin-Detailseite): schickt allen Teilnehmern ohne Rückmeldung
 * einen Push (+ ggf. E-Mail). Höchstens einmal pro Tag und Termin –
 * gesperrt über notification_log.
 */
export async function erinnereOhneAntwort(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const zurueck = `/mitglieder/termine/${eventId}`;
  const fehler = (text: string) =>
    redirect(`${zurueck}?fehler=${encodeURIComponent(text)}`);

  const profile = await requireProfile();

  // Termin über die normale Anmeldung laden (RLS: unsichtbare Termine = 404)
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();
  const event = (data as EventRow) ?? null;
  if (!event) fehler("Termin nicht gefunden.");

  // Wer darf anstupsen? Admin/Bearbeiter immer, sonst Kapitän/Vize des Teams
  const darf =
    profile.role === "admin" ||
    profile.role === "editor" ||
    (!!event!.team_id &&
      (await getManageableTeamIds(profile)).has(event!.team_id));
  if (!darf) fehler("Dafür fehlt dir die Berechtigung.");
  if (!brauchtRueckmeldung(event!)) {
    fehler("Für diesen Termin ist keine Zu-/Absage nötig.");
  }
  if (new Date(event!.ends_at ?? event!.starts_at).getTime() < Date.now()) {
    fehler("Der Termin liegt in der Vergangenheit.");
  }

  // Alle ohne Antwort (Team-Vorbelegungen zählen als Antwort – wie auf der
  // Detailseite unter „Keine Rückmeldung“); der Auslöser selbst wird nicht
  // erinnert
  const teilnehmer = await getEventParticipants(event!);
  const offeneAlle = teilnehmer
    .filter((p) => p.status === null)
    .map((p) => p.profile.id);
  const offene = offeneAlle.filter((id) => id !== profile.id);
  if (offene.length === 0) {
    fehler(
      offeneAlle.length > 0
        ? "Nur du selbst hast noch nicht geantwortet."
        : "Niemand offen – alle haben schon geantwortet.",
    );
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return fehler("Versand nicht konfiguriert (SUPABASE_SERVICE_ROLE_KEY fehlt).");
  }

  // Höchstens 1× pro Tag und Termin (Berliner Kalendertag als Sperr-Schlüssel)
  const heute = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const { error: logError } = await admin
    .from("notification_log")
    .insert({ key: `anstupsen:${eventId}:${heute}` });
  if (logError) {
    fehler("Heute wurde schon erinnert – morgen geht es wieder.");
  }

  const zeit =
    event!.time_tbd || formatTime(event!.starts_at) === "00:00"
      ? " – Uhrzeit folgt"
      : `, ${formatTime(event!.starts_at)} Uhr`;
  await benachrichtige(offene, {
    title: `🔔 Bitte antworten: ${event!.title}`,
    body: `${formatDate(event!.starts_at)}${zeit} – du hast noch nicht zu- oder abgesagt.`,
    url: `/mitglieder/termine/${eventId}`,
  });

  redirect(`${zurueck}?angestupst=${offene.length}`);
}
