"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { benachrichtige, sendeTestMail } from "@/lib/benachrichtigung";
import {
  NULIGA_STAFFEL_URL_KEY,
  normalizeNuligaStaffelUrl,
} from "@/lib/settings";

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
  redirect(`${PFAD}?gespeichert=mail-${Date.now()}`);
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
  redirect(`${PFAD}?gespeichert=fragen-${Date.now()}`);
}

/** Direkte Staffel-Adresse des nuLiga-Menülinks speichern. */
export async function saveNuligaStaffelUrl(formData: FormData) {
  await requireAdmin();

  const url = normalizeNuligaStaffelUrl(
    String(formData.get("url") ?? ""),
  );
  if (!url) {
    redirect(
      `${PFAD}?fehler=${encodeURIComponent(
        "Bitte eine gültige öffentliche HTTPS-Adresse auf liga.nu eintragen.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.from("app_settings").upsert({
    key: NULIGA_STAFFEL_URL_KEY,
    value: url,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    redirect(`${PFAD}?fehler=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(PFAD);
  revalidatePath("/mitglieder", "layout");
  revalidatePath("/mitglieder/nuliga");
  redirect(`${PFAD}?gespeichert=nuliga-${Date.now()}`);
}

/** Öffnet oder schließt die Trikotgrößen-Abfrage. */
export async function saveJerseySurveySetting(formData: FormData) {
  const profile = await requireAdmin();
  const open = String(formData.get("open") ?? "") === "true";
  const supabase = await createClient();

  // Atomare Statusänderung: genau ein paralleler Öffnungsvorgang bekommt
  // `true` zurück und darf Benachrichtigungen auslösen.
  const { data: wurdeGeoeffnet, error } = await supabase.rpc(
    "set_jersey_survey_open",
    { new_open: open },
  );
  if (error) {
    const text = /column|schema|relation|function|schema cache/i.test(
      error.message,
    )
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    redirect(`${PFAD}?fehler=${encodeURIComponent(text)}`);
  }

  // Nur beim Wechsel von geschlossen auf offen benachrichtigen – und nur
  // Mitglieder, die noch keine Größe gewählt haben.
  if (wurdeGeoeffnet) {
    const { data: offeneProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id")
      .eq("is_active", true)
      .is("jersey_size", null)
      .neq("id", profile.id);
    if (profileError) {
      redirect(`${PFAD}?fehler=${encodeURIComponent(profileError.message)}`);
    }
    await benachrichtige(
      (offeneProfile ?? []).map((p) => p.id as string),
      {
        title: "👕 Trikotgröße auswählen",
        body: "Bitte wähle deine Trikotgröße von 2XS bis 9XL in der App aus.",
        url: "/mitglieder/profil#trikotgroesse",
      },
    );
  }

  revalidatePath(PFAD);
  revalidatePath("/mitglieder");
  revalidatePath("/mitglieder/profil");
  revalidatePath("/mitglieder/admin/mitglieder");
  redirect(`${PFAD}?gespeichert=trikot-${Date.now()}`);
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
