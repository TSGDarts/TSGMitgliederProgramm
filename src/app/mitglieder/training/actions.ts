"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTrainer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { berlinLocalToISO } from "@/lib/tz";
import { meldeNeuenTermin } from "@/lib/benachrichtigung";

const PFAD = "/mitglieder/training";

/** Bricht ab und zeigt die Fehlermeldung oben auf der Seite an. */
function abbruchMitFehler(msg: string): never {
  let text = msg;
  if (/column|schema cache|policy|row-level/i.test(msg)) {
    text =
      "Die Datenbank ist noch nicht auf dem neuesten Stand. Bitte das Skript " +
      `ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen und erneut speichern. (Technisch: ${msg})`;
  }
  redirect(`${PFAD}?fehler=${encodeURIComponent(text)}`);
}

/** Nach erfolgreichem Speichern: Erfolgs-Hinweis + Formulare zuklappen/leeren. */
function fertigMitErfolg(): never {
  redirect(`${PFAD}?gespeichert=${Date.now()}`);
}

function revalidateTraining() {
  revalidatePath(PFAD);
  revalidatePath("/mitglieder");
  revalidatePath("/mitglieder/termine");
}

function readFields(formData: FormData) {
  const title =
    String(formData.get("title") ?? "").trim() || "Training";
  const starts_at = berlinLocalToISO(String(formData.get("starts_at") ?? ""));
  if (!starts_at) abbruchMitFehler("Bitte Datum und Startzeit angeben.");
  const ends_at = berlinLocalToISO(String(formData.get("ends_at") ?? ""));
  if (ends_at && new Date(ends_at) <= new Date(starts_at)) {
    abbruchMitFehler("Das Ende muss nach dem Beginn liegen.");
  }
  return {
    title,
    type: "training" as const,
    team_id: String(formData.get("team_id") ?? "") || null,
    starts_at,
    ends_at,
    location: String(formData.get("location") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    is_public: formData.get("is_public") === "on",
    trainer_ids: formData.getAll("trainer_ids").map(String).filter(Boolean),
    // Trainings werden nie an die Competition-App übergeben
    feed_export: false,
  };
}

export async function createTraining(formData: FormData) {
  const profile = await requireTrainer();
  const fields = readFields(formData);

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("events")
    .insert({
      ...fields,
      source: "manual",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) abbruchMitFehler(error.message);

  // Alle Betroffenen benachrichtigen (Push/E-Mail, best-effort)
  if (created?.id) {
    await meldeNeuenTermin(
      {
        id: created.id,
        title: fields.title,
        team_id: fields.team_id,
        starts_at: fields.starts_at,
        time_tbd: false,
        type: fields.type,
      },
      [],
      profile.id,
    );
  }

  revalidateTraining();
  fertigMitErfolg();
}

export async function updateTraining(formData: FormData) {
  await requireTrainer();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const fields = readFields(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update(fields)
    .eq("id", id)
    .eq("type", "training");
  if (error) abbruchMitFehler(error.message);

  revalidateTraining();
  fertigMitErfolg();
}

export async function deleteTraining(formData: FormData) {
  await requireTrainer();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .delete()
    .eq("id", id)
    .eq("type", "training");
  if (error) abbruchMitFehler(error.message);

  revalidateTraining();
}
