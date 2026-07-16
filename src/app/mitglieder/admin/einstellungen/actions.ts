"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { sendeTestMail } from "@/lib/benachrichtigung";

const PFAD = "/mitglieder/admin/einstellungen";

/** M365-Zugangsdaten für den E-Mail-Versand speichern (nur Admins). */
export async function saveMailEinstellungen(formData: FormData) {
  await requireAdmin();

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    redirect(`${PFAD}?fehler=${encodeURIComponent("SUPABASE_SERVICE_ROLE_KEY fehlt.")}`);
  }

  const now = new Date().toISOString();
  // Ablaufdatum des geheimen Clientschlüssels (JJJJ-MM-TT) – für die
  // automatische Admin-Erinnerung vor dem Ablauf
  const ablaufRaw = String(formData.get("ablauf") ?? "").trim();
  const ablauf = /^\d{4}-\d{2}-\d{2}$/.test(ablaufRaw) ? ablaufRaw : "";
  const eintraege = [
    { key: "graph_tenant_id", value: String(formData.get("tenant") ?? "").trim() },
    { key: "graph_client_id", value: String(formData.get("client") ?? "").trim() },
    { key: "graph_absender", value: String(formData.get("absender") ?? "").trim() },
    { key: "graph_secret_ablauf", value: ablauf },
  ];
  // Der geheime Schlüssel wird nur überschrieben, wenn etwas eingegeben wurde
  const secret = String(formData.get("secret") ?? "").trim();
  if (secret) eintraege.push({ key: "graph_client_secret", value: secret });

  const { error } = await admin
    .from("secure_settings")
    .upsert(eintraege.map((e) => ({ ...e, updated_at: now })));
  if (error) {
    const text = /relation|schema/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    redirect(`${PFAD}?fehler=${encodeURIComponent(text)}`);
  }

  revalidatePath(PFAD);
  redirect(`${PFAD}?gespeichert=${Date.now()}`);
}

/** Kontakt für das Weiterleiten von Fragen speichern (nur Admins). */
export async function saveFragenEinstellungen(formData: FormData) {
  await requireAdmin();

  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from("app_settings").upsert([
    {
      key: "fragen_email",
      value: String(formData.get("email") ?? "").trim(),
      updated_at: now,
    },
    {
      key: "fragen_whatsapp",
      value: String(formData.get("whatsapp") ?? "").trim(),
      updated_at: now,
    },
  ]);
  if (error) {
    redirect(`${PFAD}?fehler=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(PFAD);
  revalidatePath("/mitglieder/fragen");
  redirect(`${PFAD}?gespeichert=${Date.now()}`);
}

/** Test-E-Mail an die eigene Adresse schicken. */
export async function testMailAction() {
  const profile = await requireAdmin();
  if (!profile.email) {
    redirect(`${PFAD}?fehler=${encodeURIComponent("Dein Profil hat keine E-Mail-Adresse.")}`);
  }
  const res = await sendeTestMail(profile.email!);
  if (res.ok) {
    redirect(`${PFAD}?test=${encodeURIComponent(res.message)}`);
  }
  redirect(`${PFAD}?fehler=${encodeURIComponent(res.message)}`);
}
