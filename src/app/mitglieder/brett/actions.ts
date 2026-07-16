"use server";

// Schwarzes Brett: Ankündigungen + Umfragen. Pflegen dürfen Admins und
// Bearbeiter, abstimmen darf jedes Mitglied (eigene Stimmen, RLS).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile, requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { benachrichtige } from "@/lib/benachrichtigung";

const PFAD = "/mitglieder/brett";

/** Benachrichtigung an alle aktiven Mitglieder (außer dem Auslöser). */
async function melden(ausserId: string, title: string, body: string) {
  try {
    const admin = createAdminSupabase();
    const { data: alle } = await admin
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .neq("id", ausserId);
    await benachrichtige((alle ?? []).map((p) => p.id as string), {
      title,
      body,
      url: PFAD,
    });
  } catch {
    // best-effort
  }
}

/** Ankündigung veröffentlichen (Admin/Bearbeiter) – mit Push an alle. */
export async function createAnnouncement(formData: FormData) {
  const profile = await requireEditor();
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .insert({ title, body, created_by: profile.id });
  if (error) {
    const text = /relation|schema/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    redirect(`${PFAD}?fehler=${encodeURIComponent(text)}`);
  }

  await melden(profile.id, `📢 ${title}`, body.slice(0, 160) || "Neue Ankündigung des Vereins.");
  revalidatePath(PFAD);
  revalidatePath("/mitglieder");
  redirect(`${PFAD}?gespeichert=ankuendigung-${Date.now()}`);
}

export async function deleteAnnouncement(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("announcements").delete().eq("id", id);
  revalidatePath(PFAD);
  revalidatePath("/mitglieder");
}

/** Umfrage starten (Admin/Bearbeiter) – mit Push an alle. */
export async function createPoll(formData: FormData) {
  const profile = await requireEditor();
  const question = String(formData.get("question") ?? "").trim();
  const options = String(formData.get("options") ?? "")
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
    .slice(0, 20);
  const multi = formData.get("multi") === "on";
  if (!question || options.length < 2) {
    redirect(
      `${PFAD}?fehler=${encodeURIComponent("Bitte Frage und mindestens zwei Antwortmöglichkeiten angeben.")}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("polls")
    .insert({ question, options, multi, created_by: profile.id });
  if (error) {
    const text = /relation|schema/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    redirect(`${PFAD}?fehler=${encodeURIComponent(text)}`);
  }

  await melden(profile.id, `🗳 Neue Umfrage: ${question}`, "Jetzt abstimmen!");
  revalidatePath(PFAD);
  redirect(`${PFAD}?gespeichert=umfrage-${Date.now()}`);
}

/** Umfrage schließen/öffnen bzw. löschen (Admin/Bearbeiter). */
export async function togglePoll(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  const open = String(formData.get("open") ?? "") === "true";
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("polls").update({ open }).eq("id", id);
  revalidatePath(PFAD);
}

export async function deletePoll(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("polls").delete().eq("id", id);
  revalidatePath(PFAD);
}

/** Eigene Stimme(n) abgeben – ersetzt die bisherige Auswahl. */
export async function abstimmen(
  pollId: string,
  optionIndexes: number[],
): Promise<{ ok: boolean; message?: string }> {
  const profile = await requireProfile();
  if (!pollId) return { ok: false, message: "Umfrage fehlt." };

  const supabase = await createClient();
  const { data: poll } = await supabase
    .from("polls")
    .select("open, multi, options")
    .eq("id", pollId)
    .maybeSingle();
  if (!poll) return { ok: false, message: "Umfrage nicht gefunden." };
  if (!poll.open) return { ok: false, message: "Die Umfrage ist geschlossen." };

  const anzahl = (poll.options as string[]).length;
  let auswahl = [
    ...new Set(
      optionIndexes
        .map((i) => Math.round(i))
        .filter((i) => Number.isFinite(i) && i >= 0 && i < anzahl),
    ),
  ];
  if (!poll.multi) auswahl = auswahl.slice(0, 1);
  if (auswahl.length === 0) {
    return { ok: false, message: "Bitte eine Antwort auswählen." };
  }

  await supabase
    .from("poll_votes")
    .delete()
    .eq("poll_id", pollId)
    .eq("profile_id", profile.id);
  const { error } = await supabase.from("poll_votes").insert(
    auswahl.map((option_index) => ({
      poll_id: pollId,
      profile_id: profile.id,
      option_index,
    })),
  );
  if (error) return { ok: false, message: error.message };

  revalidatePath(PFAD);
  return { ok: true };
}
