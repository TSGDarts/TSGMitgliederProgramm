"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { composeAddress } from "@/lib/extras";

function revalidate() {
  revalidatePath("/mitglieder/admin/gegner");
  revalidatePath("/mitglieder/admin/termine");
}

function readAddress(formData: FormData) {
  const street = String(formData.get("street") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const boardsRaw = Number(formData.get("boards") ?? 0);
  return {
    street,
    zip,
    city,
    address: composeAddress(street, zip, city),
    boards: boardsRaw >= 1 ? boardsRaw : null,
  };
}

export async function createOpponent(formData: FormData) {
  await requireEditor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  await supabase.from("opponents").insert({
    name,
    ...readAddress(formData),
    contact_name: String(formData.get("contact_name") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  });
  revalidate();
}

export async function updateOpponent(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const supabase = await createClient();
  await supabase
    .from("opponents")
    .update({
      name,
      ...readAddress(formData),
      contact_name: String(formData.get("contact_name") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
    })
    .eq("id", id);
  revalidate();
}

export async function deleteOpponent(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("opponents").delete().eq("id", id);
  revalidate();
}

/** Vorlage für die Heimspiel-Nachricht an den Gegner speichern. */
export async function saveGegnerVorlage(formData: FormData) {
  await requireEditor();
  const text = String(formData.get("vorlage") ?? "").trim();

  const supabase = await createClient();
  await supabase.from("app_settings").upsert({
    key: "gegner_vorlage",
    value: text,
    updated_at: new Date().toISOString(),
  });
  revalidate();
}

/** Eigene Heimspielstätte (wird bei Heimterminen als Ort verwendet). */
export async function saveHomeAddress(formData: FormData) {
  await requireEditor();
  const { street, zip, city, address } = readAddress(formData);

  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("app_settings").upsert([
    { key: "home_street", value: street, updated_at: now },
    { key: "home_zip", value: zip, updated_at: now },
    { key: "home_city", value: city, updated_at: now },
    { key: "home_address", value: address, updated_at: now },
  ]);
  revalidate();
}
