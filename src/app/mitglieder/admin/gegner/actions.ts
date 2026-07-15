"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function revalidate() {
  revalidatePath("/mitglieder/admin/gegner");
  revalidatePath("/mitglieder/admin/termine");
}

export async function createOpponent(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("opponents").insert({
    name,
    address: String(formData.get("address") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  revalidate();
}

export async function updateOpponent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const supabase = await createClient();
  await supabase
    .from("opponents")
    .update({
      name,
      address: String(formData.get("address") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
    })
    .eq("id", id);
  revalidate();
}

export async function deleteOpponent(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("opponents").delete().eq("id", id);
  revalidate();
}

/** Eigene Heimspielstätte (wird bei Heimterminen als Ort verwendet). */
export async function saveHomeAddress(formData: FormData) {
  await requireAdmin();
  const address = String(formData.get("address") ?? "").trim();

  const supabase = await createClient();
  await supabase.from("app_settings").upsert({
    key: "home_address",
    value: address,
    updated_at: new Date().toISOString(),
  });
  revalidate();
}
