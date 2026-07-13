"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { getManageableTeamIds } from "@/lib/member-queries";

async function assertCanManageExtras() {
  const profile = await requireProfile();
  if (profile.role === "admin") return profile;
  const teams = await getManageableTeamIds(profile);
  if (teams.size === 0) {
    throw new Error("Nur Admins und Mannschaftskapitäne dürfen das.");
  }
  return profile;
}

export async function createCompetition(formData: FormData) {
  const profile = await assertCanManageExtras();

  const title = String(formData.get("title") ?? "").trim();
  const weekday = Number(formData.get("weekday") ?? 0);
  if (!title || weekday < 1 || weekday > 7) return;

  const supabase = await createClient();
  await supabase.from("competitions").insert({
    title,
    weekday,
    mode: String(formData.get("mode") ?? "").trim(),
    doors_time: String(formData.get("doors_time") ?? "").trim(),
    start_time: String(formData.get("start_time") ?? "").trim() || "19:00",
    signup_until: String(formData.get("signup_until") ?? "").trim(),
    address: String(formData.get("address") ?? "").trim(),
    register_url: String(formData.get("register_url") ?? "").trim(),
    onsite_signup: formData.get("onsite_signup") === "on",
    created_by: profile.id,
  });

  revalidatePath("/mitglieder/competitions");
}

/** Archivieren (deaktivieren) bzw. wieder aktivieren. */
export async function toggleCompetition(formData: FormData) {
  await assertCanManageExtras();
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("is_active") ?? "") === "true";
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("competitions")
    .update({ is_active: !active })
    .eq("id", id);
  revalidatePath("/mitglieder/competitions");
}

export async function deleteCompetition(formData: FormData) {
  await assertCanManageExtras();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("competitions").delete().eq("id", id);
  revalidatePath("/mitglieder/competitions");
}
