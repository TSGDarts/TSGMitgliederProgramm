"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getManageableTeamIds } from "@/lib/member-queries";
import { berlinLocalToISO } from "@/lib/tz";

async function assertCanManageExtras() {
  const profile = await requireProfile();
  if (profile.role === "admin") return profile;
  const teams = await getManageableTeamIds(profile);
  if (teams.size === 0) {
    throw new Error("Nur Admins und Mannschaftskapitäne dürfen das.");
  }
  return profile;
}

/** Bricht ab und zeigt die Fehlermeldung oben auf der Seite an. */
function abbruchMitFehler(msg: string): never {
  let text = msg;
  if (/column|schema cache/i.test(msg)) {
    text =
      "In der Datenbank fehlt eine Spalte. Bitte das Skript ALLE_ERWEITERUNGEN.sql " +
      `im Supabase SQL-Editor ausführen und erneut speichern. (Technisch: ${msg})`;
  }
  redirect(`/mitglieder/turniere?fehler=${encodeURIComponent(text)}`);
}

/** Nach erfolgreichem Speichern: Erfolgs-Hinweis + Formulare zuklappen/leeren. */
function fertigMitErfolg(): never {
  redirect(`/mitglieder/turniere?gespeichert=${Date.now()}`);
}

/** Liest die gemeinsamen Turnier-Felder aus dem Formular. */
function readTournamentFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const starts_at = berlinLocalToISO(String(formData.get("starts_at") ?? ""));
  if (!title || !starts_at) {
    abbruchMitFehler("Bitte Turniername und Turnierbeginn angeben.");
  }

  const deadlineRaw = String(formData.get("entry_deadline") ?? "");
  const entry_deadline = deadlineRaw ? berlinLocalToISO(deadlineRaw) : null;

  const ends_at = berlinLocalToISO(String(formData.get("ends_at") ?? ""));
  if (ends_at && new Date(ends_at) <= new Date(starts_at)) {
    abbruchMitFehler("Das Turnierende muss nach dem Turnierbeginn liegen.");
  }

  const kindRaw = String(formData.get("kind") ?? "frei");
  const kind = ["ddv", "bdv", "bezirk", "frei"].includes(kindRaw)
    ? kindRaw
    : "frei";
  const mode = String(formData.get("mode") ?? "einzel") === "doppel"
    ? "doppel"
    : "einzel";

  // "Anzeigen bis": leer -> letzter Turniertag (danach wandert es ins Archiv)
  let display_until = String(formData.get("display_until") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(display_until)) {
    display_until = (ends_at ?? starts_at).slice(0, 10);
  }

  return {
    title,
    kind,
    mode,
    starts_at,
    ends_at,
    details_tbd: formData.get("details_tbd") === "on",
    entry_deadline,
    doors_time: String(formData.get("doors_time") ?? "").trim(),
    location: String(formData.get("location") ?? "").trim(),
    flyer_url: String(formData.get("flyer_url") ?? "").trim(),
    register_url: String(formData.get("register_url") ?? "").trim(),
    info_url: String(formData.get("info_url") ?? "").trim(),
    display_until,
  };
}

export async function createTournament(formData: FormData) {
  const profile = await assertCanManageExtras();
  const fields = readTournamentFields(formData);

  const supabase = await createClient();
  const { error } = await supabase.from("tournaments").insert({
    ...fields,
    created_by: profile.id,
  });
  if (error) abbruchMitFehler(error.message);

  revalidatePath("/mitglieder/turniere");
  fertigMitErfolg();
}

export async function updateTournament(formData: FormData) {
  await assertCanManageExtras();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const fields = readTournamentFields(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("tournaments")
    .update(fields)
    .eq("id", id);
  if (error) abbruchMitFehler(error.message);

  revalidatePath("/mitglieder/turniere");
  fertigMitErfolg();
}

/** Verschiebt ein Turnier sofort ins Archiv. */
export async function archiveTournament(formData: FormData) {
  await assertCanManageExtras();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const supabase = await createClient();
  await supabase
    .from("tournaments")
    .update({ display_until: yesterday })
    .eq("id", id);
  revalidatePath("/mitglieder/turniere");
}

export async function deleteTournament(formData: FormData) {
  await assertCanManageExtras();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("tournaments").delete().eq("id", id);
  revalidatePath("/mitglieder/turniere");
}
