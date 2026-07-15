"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { berlinLocalToISO } from "@/lib/tz";
import { romanTeamNo } from "@/lib/extras";
import { meldeNeuenTermin } from "@/lib/benachrichtigung";
import type { EventType } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Liest Gegner + Heim/Auswärts aus dem Formular und ergänzt – falls leer –
 * Titel und Ort automatisch (Gegner-Adresse bzw. eigene Heimspielstätte).
 */
async function resolveOpponentFields(
  supabase: SupabaseClient,
  formData: FormData,
  title: string,
  location: string,
) {
  const opponent_id = String(formData.get("opponent_id") ?? "") || null;
  const teamNoRaw = Math.round(Number(formData.get("opponent_team_no") ?? 0));
  const opponent_team_no =
    opponent_id && teamNoRaw >= 1 && teamNoRaw <= 99 ? teamNoRaw : null;
  const homeAwayRaw = String(formData.get("home_away") ?? "");
  const home_away = ["heim", "auswaerts"].includes(homeAwayRaw)
    ? homeAwayRaw
    : "";
  const noStyle = String(formData.get("team_no_style") ?? "roemisch");

  if (opponent_id) {
    const { data: opp } = await supabase
      .from("opponents")
      .select("name,address")
      .eq("id", opponent_id)
      .maybeSingle();
    if (opp) {
      const suffix =
        noStyle === "zahl"
          ? opponent_team_no && opponent_team_no > 1
            ? String(opponent_team_no)
            : ""
          : romanTeamNo(opponent_team_no);
      const oppName = `${opp.name}${suffix ? ` ${suffix}` : ""}`;
      if (!title) {
        title =
          home_away === "auswaerts"
            ? `Auswärts bei ${oppName}`
            : home_away === "heim"
              ? `Heim gegen ${oppName}`
              : `Gegen ${oppName}`;
      }
      if (!location && home_away === "auswaerts" && opp.address) {
        location = opp.address;
      }
    }
  }

  if (!location && home_away === "heim") {
    const { data: home } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "home_address")
      .maybeSingle();
    if (home?.value) location = home.value as string;
  }

  return { opponent_id, opponent_team_no, home_away, title, location };
}

const VALID_TYPES: EventType[] = [
  "match",
  "pokal",
  "friendly",
  "training",
  "meeting",
  "other",
];

/**
 * Bricht ab und zeigt die Fehlermeldung oben auf der Seite an –
 * stilles Scheitern hat schon einmal für Verwirrung gesorgt.
 */
function abbruchMitFehler(msg: string): never {
  let text = msg;
  if (/column|schema cache/i.test(msg)) {
    text =
      "In der Datenbank fehlt eine Spalte. Bitte das Skript ALLE_ERWEITERUNGEN.sql " +
      `im Supabase SQL-Editor ausführen und erneut speichern. (Technisch: ${msg})`;
  }
  redirect(`/mitglieder/admin/termine?fehler=${encodeURIComponent(text)}`);
}

/**
 * Nach erfolgreichem Speichern: Seite neu laden mit Erfolgs-Hinweis.
 * Der Zeitstempel sorgt dafür, dass offene Bearbeiten-Felder zuklappen
 * und das Anlege-Formular geleert wird (auch bei mehreren Speicherungen
 * hintereinander).
 */
function fertigMitErfolg(): never {
  redirect(`/mitglieder/admin/termine?gespeichert=${Date.now()}`);
}

/**
 * Liest Datum/Startzeit/Ende aus dem Formular. Die Startzeit ist optional
 * (leer = 00:00 + „Uhrzeit folgt“); das Ende besteht aus eigenem Datum
 * und eigener Uhrzeit, beides optional.
 */
function readZeitraum(formData: FormData) {
  const datum = String(formData.get("starts_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) {
    abbruchMitFehler("Bitte ein Datum angeben.");
  }
  const zeitRaw = String(formData.get("starts_time") ?? "").trim();
  const zeitLeer = !/^\d{2}:\d{2}$/.test(zeitRaw);
  const starts_at = berlinLocalToISO(`${datum}T${zeitLeer ? "00:00" : zeitRaw}`)!;

  const endDatumRaw = String(formData.get("ends_date") ?? "").trim();
  const endZeitRaw = String(formData.get("ends_time") ?? "").trim();
  const endDatumOk = /^\d{4}-\d{2}-\d{2}$/.test(endDatumRaw);
  const endZeit = /^\d{2}:\d{2}$/.test(endZeitRaw) ? endZeitRaw : "";
  let ends_at: string | null = null;
  if (endDatumOk || endZeit) {
    const endDatum = endDatumOk ? endDatumRaw : datum;
    // Gleicher Tag ohne End-Uhrzeit = kein Zeitraum
    if (!(endDatum === datum && !endZeit)) {
      ends_at = berlinLocalToISO(`${endDatum}T${endZeit || "00:00"}`);
      if (ends_at && new Date(ends_at) <= new Date(starts_at)) {
        abbruchMitFehler("Das Ende muss nach dem Beginn liegen.");
      }
    }
  }
  return { starts_at, ends_at, zeitLeer };
}

function revalidateEvents(id?: string) {
  revalidatePath("/mitglieder/admin/termine");
  revalidatePath("/mitglieder/termine");
  revalidatePath("/mitglieder");
  revalidatePath("/termine");
  revalidatePath("/");
  if (id) revalidatePath(`/mitglieder/termine/${id}`);
}

export async function createEvent(formData: FormData) {
  const profile = await requireEditor();

  const { starts_at, ends_at, zeitLeer } = readZeitraum(formData);

  const typeRaw = String(formData.get("type") ?? "other") as EventType;
  const type = VALID_TYPES.includes(typeRaw) ? typeRaw : "other";
  const team_id = String(formData.get("team_id") ?? "") || null;

  const supabase = await createClient();
  const { opponent_id, opponent_team_no, home_away, title, location } =
    await resolveOpponentFields(
      supabase,
      formData,
      String(formData.get("title") ?? "").trim(),
      String(formData.get("location") ?? "").trim(),
    );
  if (!title) abbruchMitFehler("Bitte einen Titel angeben oder einen Gegner wählen.");

  const { data: created, error: createError } = await supabase
    .from("events")
    .insert({
      title,
      type,
      team_id,
      starts_at,
      ends_at,
      location,
      opponent_id,
      opponent_team_no,
      home_away,
      description: String(formData.get("description") ?? "").trim(),
      meeting_url: String(formData.get("meeting_url") ?? "").trim(),
      meet_home_time: String(formData.get("meet_home_time") ?? "").trim(),
      meet_venue_time: String(formData.get("meet_venue_time") ?? "").trim(),
      is_public: formData.get("is_public") === "on",
      time_tbd: formData.get("time_tbd") === "on" || zeitLeer,
      feed_export: formData.get("feed_export") === "on",
      contact_ids: formData.getAll("contact_ids").map(String).filter(Boolean),
      source: "manual",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (createError) abbruchMitFehler(createError.message);

  // Optionale Einladungsliste: nur die Angehakten sehen den Termin.
  const invitees = formData.getAll("invitees").map(String).filter(Boolean);
  if (created?.id && invitees.length) {
    const { error: invError } = await supabase.from("event_invitees").insert(
      invitees.map((profile_id) => ({ event_id: created.id, profile_id })),
    );
    if (invError) abbruchMitFehler(invError.message);
  }

  // Alle Betroffenen benachrichtigen (Push/E-Mail, best-effort)
  if (created?.id) {
    await meldeNeuenTermin(
      {
        id: created.id,
        title,
        team_id,
        starts_at,
        time_tbd: formData.get("time_tbd") === "on" || zeitLeer,
        type,
      },
      invitees,
      profile.id,
    );
  }

  revalidateEvents();
  fertigMitErfolg();
}

export async function updateEvent(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { starts_at, ends_at, zeitLeer } = readZeitraum(formData);

  const typeRaw = String(formData.get("type") ?? "other") as EventType;
  const type = VALID_TYPES.includes(typeRaw) ? typeRaw : "other";
  const team_id = String(formData.get("team_id") ?? "") || null;

  const supabase = await createClient();
  const { opponent_id, opponent_team_no, home_away, title, location } =
    await resolveOpponentFields(
      supabase,
      formData,
      String(formData.get("title") ?? "").trim(),
      String(formData.get("location") ?? "").trim(),
    );
  if (!title) abbruchMitFehler("Bitte einen Titel angeben oder einen Gegner wählen.");

  const { error: updateError } = await supabase
    .from("events")
    .update({
      title,
      type,
      team_id,
      starts_at,
      ends_at,
      location,
      opponent_id,
      opponent_team_no,
      home_away,
      description: String(formData.get("description") ?? "").trim(),
      meeting_url: String(formData.get("meeting_url") ?? "").trim(),
      meet_home_time: String(formData.get("meet_home_time") ?? "").trim(),
      meet_venue_time: String(formData.get("meet_venue_time") ?? "").trim(),
      is_public: formData.get("is_public") === "on",
      time_tbd: formData.get("time_tbd") === "on" || zeitLeer,
      feed_export: formData.get("feed_export") === "on",
      contact_ids: formData.getAll("contact_ids").map(String).filter(Boolean),
    })
    .eq("id", id);
  if (updateError) abbruchMitFehler(updateError.message);

  // Einladungsliste sauber ersetzen (hinzufügen UND entfernen greifen sofort)
  const invitees = formData.getAll("invitees").map(String).filter(Boolean);
  await supabase.from("event_invitees").delete().eq("event_id", id);
  if (invitees.length) {
    const { error: invError } = await supabase.from("event_invitees").insert(
      invitees.map((profile_id) => ({ event_id: id, profile_id })),
    );
    if (invError) abbruchMitFehler(invError.message);
  }

  revalidateEvents(id);
  fertigMitErfolg();
}

/** Schnell-Umschalter: Termin an die Competition-App übergeben ja/nein. */
export async function toggleFeedExport(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const next = formData.get("next") === "1";

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ feed_export: next })
    .eq("id", id);
  if (error) abbruchMitFehler(error.message);

  revalidateEvents(id);
  fertigMitErfolg();
}

/** Archiv-Frist speichern: nach so vielen Tagen verschwinden Termine. */
export async function saveArchiveDays(formData: FormData) {
  await requireEditor();
  const n = Math.round(Number(formData.get("archive_days") ?? 0));
  if (!Number.isFinite(n) || n < 1 || n > 365) return;

  const supabase = await createClient();
  await supabase.from("app_settings").upsert({
    key: "event_archive_days",
    value: String(n),
    updated_at: new Date().toISOString(),
  });
  revalidateEvents();
}

export async function deleteEvent(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", id);
  revalidateEvents(id);
}
