"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PFAD = "/mitglieder/regeln";

/** Regelwerk speichern (nur Admins). Leerer Text = Standard-Regeln. */
export async function saveRegeln(formData: FormData) {
  await requireAdmin();

  const text = String(formData.get("text") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({
    key: "regeln_text",
    value: text,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    redirect(`${PFAD}?fehler=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(PFAD);
  redirect(`${PFAD}?gespeichert=${Date.now()}`);
}
