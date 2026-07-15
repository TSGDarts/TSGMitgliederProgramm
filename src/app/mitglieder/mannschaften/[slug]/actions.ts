"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { berlinLocalToISO } from "@/lib/tz";
import { meldeNeuenTermin } from "@/lib/benachrichtigung";
import type { EventType } from "@/lib/types";

const VALID_TYPES: EventType[] = [
  "match",
  "pokal",
  "friendly",
  "training",
  "meeting",
  "fest",
  "other",
];

/** Prüft, ob der aktuelle Nutzer das Team verwalten darf (Admin/Bearbeiter oder Kapitän/Vize). */
async function assertCanManage(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Nicht angemeldet.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role === "admin" || profile?.role === "editor") {
    return { supabase, userId: user.id };
  }

  const { data: tm } = await supabase
    .from("team_members")
    .select("is_captain,is_vice_captain")
    .eq("team_id", teamId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!tm || (!tm.is_captain && !tm.is_vice_captain)) {
    throw new Error("Keine Berechtigung für dieses Team.");
  }
  return { supabase, userId: user.id };
}

export async function createTeamEvent(slug: string, formData: FormData) {
  const teamId = String(formData.get("team_id") ?? "");
  const { supabase, userId } = await assertCanManage(teamId);

  const title = String(formData.get("title") ?? "").trim();
  const starts_at = berlinLocalToISO(String(formData.get("starts_at") ?? ""));
  if (!title || !starts_at) return;

  const typeRaw = String(formData.get("type") ?? "match") as EventType;
  const type = VALID_TYPES.includes(typeRaw) ? typeRaw : "other";

  const { data: created } = await supabase
    .from("events")
    .insert({
      team_id: teamId,
      title,
      type,
      starts_at,
      location: String(formData.get("location") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      is_public: formData.get("is_public") === "on",
      time_tbd: formData.get("time_tbd") === "on",
      source: "manual",
      created_by: userId,
    })
    .select("id")
    .single();

  // Kader benachrichtigen (Push/E-Mail, best-effort)
  if (created?.id) {
    await meldeNeuenTermin(
      {
        id: created.id,
        title,
        team_id: teamId,
        starts_at,
        time_tbd: formData.get("time_tbd") === "on",
        type,
      },
      [],
      userId,
    );
  }

  revalidatePath(`/mitglieder/mannschaften/${slug}`);
  revalidatePath("/mitglieder/termine");
  revalidatePath("/mitglieder");
  revalidatePath("/termine");
}

export async function updateTeamEvent(slug: string, formData: FormData) {
  const teamId = String(formData.get("team_id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const { supabase } = await assertCanManage(teamId);
  if (!eventId) return;

  const title = String(formData.get("title") ?? "").trim();
  const starts_at = berlinLocalToISO(String(formData.get("starts_at") ?? ""));
  if (!title || !starts_at) return;

  const typeRaw = String(formData.get("type") ?? "match") as EventType;
  const type = VALID_TYPES.includes(typeRaw) ? typeRaw : "other";

  await supabase
    .from("events")
    .update({
      title,
      type,
      starts_at,
      location: String(formData.get("location") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      is_public: formData.get("is_public") === "on",
      time_tbd: formData.get("time_tbd") === "on",
    })
    .eq("id", eventId)
    .eq("team_id", teamId);

  revalidatePath(`/mitglieder/mannschaften/${slug}`);
  revalidatePath("/mitglieder/termine");
  revalidatePath(`/mitglieder/termine/${eventId}`);
  revalidatePath("/mitglieder");
  revalidatePath("/termine");
}

export async function deleteTeamEvent(slug: string, formData: FormData) {
  const teamId = String(formData.get("team_id") ?? "");
  const eventId = String(formData.get("event_id") ?? "");
  const { supabase } = await assertCanManage(teamId);
  if (!eventId) return;

  await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("team_id", teamId);

  revalidatePath(`/mitglieder/mannschaften/${slug}`);
  revalidatePath("/mitglieder/termine");
}
