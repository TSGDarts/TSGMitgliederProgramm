"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { berlinLocalToISO } from "@/lib/tz";
import { romanTeamNo } from "@/lib/extras";
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
  const teamNoRaw = Number(formData.get("opponent_team_no") ?? 0);
  const opponent_team_no =
    opponent_id && teamNoRaw >= 1 && teamNoRaw <= 10 ? teamNoRaw : null;
  const homeAwayRaw = String(formData.get("home_away") ?? "");
  const home_away = ["heim", "auswaerts"].includes(homeAwayRaw)
    ? homeAwayRaw
    : "";

  if (opponent_id) {
    const { data: opp } = await supabase
      .from("opponents")
      .select("name,address")
      .eq("id", opponent_id)
      .maybeSingle();
    if (opp) {
      const suffix = romanTeamNo(opponent_team_no);
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

function revalidateEvents(id?: string) {
  revalidatePath("/mitglieder/admin/termine");
  revalidatePath("/mitglieder/termine");
  revalidatePath("/mitglieder");
  revalidatePath("/termine");
  revalidatePath("/");
  if (id) revalidatePath(`/mitglieder/termine/${id}`);
}

export async function createEvent(formData: FormData) {
  const profile = await requireAdmin();

  const startsLocal = String(formData.get("starts_at") ?? "");
  const starts_at = berlinLocalToISO(startsLocal);
  if (!starts_at) return;

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
  if (!title) return; // weder Titel noch Gegner angegeben

  const { data: created } = await supabase
    .from("events")
    .insert({
      title,
      type,
      team_id,
      starts_at,
      location,
      opponent_id,
      opponent_team_no,
      home_away,
      description: String(formData.get("description") ?? "").trim(),
      meeting_url: String(formData.get("meeting_url") ?? "").trim(),
      is_public: formData.get("is_public") === "on",
      source: "manual",
      created_by: profile.id,
    })
    .select("id")
    .single();

  // Optionale Einladungsliste: nur die Angehakten sehen den Termin.
  const invitees = formData.getAll("invitees").map(String).filter(Boolean);
  if (created?.id && invitees.length) {
    await supabase.from("event_invitees").insert(
      invitees.map((profile_id) => ({ event_id: created.id, profile_id })),
    );
  }

  revalidateEvents();
}

export async function updateEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const starts_at = berlinLocalToISO(String(formData.get("starts_at") ?? ""));
  if (!starts_at) return;

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
  if (!title) return;

  await supabase
    .from("events")
    .update({
      title,
      type,
      team_id,
      starts_at,
      location,
      opponent_id,
      opponent_team_no,
      home_away,
      description: String(formData.get("description") ?? "").trim(),
      meeting_url: String(formData.get("meeting_url") ?? "").trim(),
      is_public: formData.get("is_public") === "on",
    })
    .eq("id", id);

  // Einladungsliste sauber ersetzen (hinzufügen UND entfernen greifen sofort)
  const invitees = formData.getAll("invitees").map(String).filter(Boolean);
  await supabase.from("event_invitees").delete().eq("event_id", id);
  if (invitees.length) {
    await supabase.from("event_invitees").insert(
      invitees.map((profile_id) => ({ event_id: id, profile_id })),
    );
  }

  revalidateEvents(id);
}

export async function deleteEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", id);
  revalidateEvents(id);
}
