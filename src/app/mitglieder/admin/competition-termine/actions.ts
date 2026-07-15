"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/supabase/config";

const PFAD = "/mitglieder/admin/competition-termine";

/** Bricht ab und zeigt die Fehlermeldung oben auf der Seite an. */
function abbruchMitFehler(msg: string): never {
  let text = msg;
  if (/duplicate|unique/i.test(msg)) {
    text = "Für dieses Datum gibt es schon einen Competition-Termin.";
  } else if (/column|schema cache/i.test(msg)) {
    text =
      "In der Datenbank fehlt eine Spalte. Bitte das Skript ALLE_ERWEITERUNGEN.sql " +
      `im Supabase SQL-Editor ausführen und erneut speichern. (Technisch: ${msg})`;
  }
  redirect(`${PFAD}?fehler=${encodeURIComponent(text)}`);
}

/** Nach erfolgreichem Speichern: Erfolgs-Hinweis + Formulare zuklappen/leeren. */
function fertigMitErfolg(): never {
  redirect(`${PFAD}?gespeichert=${Date.now()}`);
}

/**
 * Spiegelt die Competition-Abende sofort in den Terminkalender
 * (statt auf den nächtlichen 4-Uhr-Lauf zu warten). Best-effort.
 */
async function kalenderSpiegelAktualisieren() {
  try {
    await fetch(`${siteUrl}/api/comp-import`, { cache: "no-store" });
  } catch {
    // Nicht schlimm – spätestens der nächtliche Lauf zieht nach.
  }
}

function alleSeitenAktualisieren() {
  revalidatePath(PFAD);
  revalidatePath("/mitglieder");
  revalidatePath("/mitglieder/termine");
}

function readFields(formData: FormData) {
  const date = String(formData.get("date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    abbruchMitFehler("Bitte ein Datum angeben.");
  }
  const nrRaw = String(formData.get("nr") ?? "").trim();
  const nr = nrRaw && Number.isFinite(+nrRaw) ? Math.round(+nrRaw) : null;
  const boardsRaw = String(formData.get("boards") ?? "").trim();
  const boards =
    boardsRaw && Number.isFinite(+boardsRaw) && +boardsRaw > 0
      ? Math.round(+boardsRaw)
      : null;
  return {
    date,
    event_url: String(formData.get("event_url") ?? "").trim(),
    nr,
    boards,
  };
}

export async function createCompetitionDate(formData: FormData) {
  await requireEditor();
  const fields = readFields(formData);

  const supabase = await createClient();
  const { error } = await supabase.from("competition_dates").insert(fields);
  if (error) abbruchMitFehler(error.message);

  await kalenderSpiegelAktualisieren();
  alleSeitenAktualisieren();
  fertigMitErfolg();
}

export async function updateCompetitionDate(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const fields = readFields(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("competition_dates")
    .update(fields)
    .eq("id", id);
  if (error) abbruchMitFehler(error.message);

  await kalenderSpiegelAktualisieren();
  alleSeitenAktualisieren();
  fertigMitErfolg();
}

export async function deleteCompetitionDate(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("competition_dates")
    .delete()
    .eq("id", id);
  if (error) abbruchMitFehler(error.message);

  await kalenderSpiegelAktualisieren();
  alleSeitenAktualisieren();
}
