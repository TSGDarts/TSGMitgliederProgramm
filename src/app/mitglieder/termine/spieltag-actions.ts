"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { benachrichtige } from "@/lib/benachrichtigung";
import { formatDate, formatTime } from "@/lib/format";

// Fahrgemeinschaft: jeder pflegt seinen eigenen Eintrag pro Termin.
export async function setCarpool(
  eventId: string,
  role: "fahrer" | "mitfahrer" | null,
  seats?: number,
): Promise<{ ok: boolean }> {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!role) {
    await supabase
      .from("event_carpool")
      .delete()
      .eq("event_id", eventId)
      .eq("profile_id", profile.id);
  } else {
    const { error } = await supabase.from("event_carpool").upsert({
      event_id: eventId,
      profile_id: profile.id,
      role,
      seats:
        role === "fahrer"
          ? Math.max(1, Math.min(8, Math.round(seats ?? 3)))
          : null,
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false };
  }

  revalidatePath(`/mitglieder/termine/${eventId}`);
  return { ok: true };
}

/**
 * 2k-Link zum Spiel speichern (Kapitän/Vize/Bearbeiter/Admin – den
 * Schreibschutz übernimmt die Datenbank-Policy der Termine).
 */
export async function saveMatchUrl(
  eventId: string,
  url: string,
): Promise<{ ok: boolean; message?: string }> {
  await requireProfile();
  const sauber = url.trim();
  if (sauber && !/^https?:\/\//i.test(sauber)) {
    return {
      ok: false,
      message: "Bitte einen vollständigen Link angeben (beginnt mit https://…).",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ match_url: sauber })
    .eq("id", eventId);
  if (error) {
    const text = /column|schema/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    return { ok: false, message: text };
  }

  revalidatePath(`/mitglieder/termine/${eventId}`);
  return { ok: true };
}

export interface LineupEintrag {
  profile_id: string | null;
  name: string;
}

/**
 * Aufstellung speichern: „entwurf“ bleibt unsichtbar für die Mannschaft,
 * „freigeben“ macht sie sichtbar und schickt eine Push-/E-Mail-Nachricht
 * an den ganzen Kader. Wer speichern darf, regelt der Zugriffsschutz
 * (Kapitän/Vize der Mannschaft, Bearbeiter, Admin).
 */
export async function saveLineup(
  eventId: string,
  entries: LineupEintrag[],
  aktion: "entwurf" | "freigeben",
): Promise<{ ok: boolean; message?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();

  const sauber = entries
    .map((e) => ({
      profile_id: e.profile_id || null,
      name: String(e.name ?? "").trim().slice(0, 80),
    }))
    .filter((e) => e.name)
    .slice(0, 24);

  const { data: event } = await supabase
    .from("events")
    .select("id, title, team_id, starts_at, time_tbd")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { ok: false, message: "Termin nicht gefunden." };

  const payload: Record<string, unknown> = {
    event_id: eventId,
    entries: sauber,
    updated_at: new Date().toISOString(),
  };
  if (aktion === "freigeben") payload.released = true;

  const { error } = await supabase.from("event_lineups").upsert(payload);
  if (error) {
    return {
      ok: false,
      message: /relation|schema/i.test(error.message)
        ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
        : "Keine Berechtigung oder Fehler beim Speichern.",
    };
  }

  // Bei der Freigabe: ganzen Kader benachrichtigen (best-effort)
  if (aktion === "freigeben" && event.team_id) {
    try {
      const admin = createAdminSupabase();
      const { data: kader } = await admin
        .from("team_members")
        .select("profile_id")
        .eq("team_id", event.team_id);
      const ids = (kader ?? [])
        .map((m) => m.profile_id as string)
        .filter((id) => id && id !== profile.id);
      const zeit =
        event.time_tbd || formatTime(event.starts_at as string) === "00:00"
          ? "Uhrzeit folgt"
          : `${formatTime(event.starts_at as string)} Uhr`;
      await benachrichtige(ids, {
        title: `📋 Aufstellung: ${event.title}`,
        body: `${formatDate(event.starts_at as string)}, ${zeit} – jetzt ansehen.`,
        url: `/mitglieder/termine/${eventId}`,
      });
    } catch {
      // Versand ist best-effort
    }
  }

  revalidatePath(`/mitglieder/termine/${eventId}`);
  return { ok: true };
}
