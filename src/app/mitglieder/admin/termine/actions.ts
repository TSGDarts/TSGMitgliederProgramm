"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { berlinLocalToISO } from "@/lib/tz";
import type { EventType } from "@/lib/types";

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

  const title = String(formData.get("title") ?? "").trim();
  const startsLocal = String(formData.get("starts_at") ?? "");
  const starts_at = berlinLocalToISO(startsLocal);
  if (!title || !starts_at) return;

  const typeRaw = String(formData.get("type") ?? "other") as EventType;
  const type = VALID_TYPES.includes(typeRaw) ? typeRaw : "other";
  const team_id = String(formData.get("team_id") ?? "") || null;

  const supabase = await createClient();
  await supabase.from("events").insert({
    title,
    type,
    team_id,
    starts_at,
    location: String(formData.get("location") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    is_public: formData.get("is_public") === "on",
    source: "manual",
    created_by: profile.id,
  });

  revalidateEvents();
}

export async function updateEvent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const title = String(formData.get("title") ?? "").trim();
  const starts_at = berlinLocalToISO(String(formData.get("starts_at") ?? ""));
  if (!title || !starts_at) return;

  const typeRaw = String(formData.get("type") ?? "other") as EventType;
  const type = VALID_TYPES.includes(typeRaw) ? typeRaw : "other";
  const team_id = String(formData.get("team_id") ?? "") || null;

  const supabase = await createClient();
  await supabase
    .from("events")
    .update({
      title,
      type,
      team_id,
      starts_at,
      location: String(formData.get("location") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      is_public: formData.get("is_public") === "on",
    })
    .eq("id", id);

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
