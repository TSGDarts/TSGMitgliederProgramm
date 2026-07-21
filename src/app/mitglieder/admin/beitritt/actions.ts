"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { regenerateJoinToken } from "@/lib/invites";

function readInviteBirthday(formData: FormData) {
  const raw = String(formData.get("birthday") ?? "");
  const leftRaw = String(formData.get("left_on") ?? "");
  return {
    birthday: /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null,
    birthday_public: formData.get("birthday_public") === "on",
    birthday_congrats: formData.get("birthday_congrats") === "on",
    is_trainer: formData.get("is_trainer") === "on",
    is_planner: formData.get("is_planner") === "on",
    left_on: /^\d{4}-\d{2}-\d{2}$/.test(leftRaw) ? leftRaw : null,
  };
}

/** Ausgetretenen Namen wieder aktivieren (Austrittsdatum löschen). */
export async function reaktiviereInvite(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("member_invites")
    .update({ left_on: null })
    .eq("id", id);
  revalidatePath("/mitglieder/admin/beitritt");
  revalidatePath("/mitglieder/admin/mitglieder");
}

export async function addInviteName(formData: FormData) {
  await requireAdmin();
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return;
  const roleRaw = String(formData.get("role") ?? "player");
  const role = ["admin", "editor", "player", "member"].includes(roleRaw)
    ? roleRaw
    : "player";

  // Mannschafts-Zuordnung läuft NICHT hier, sondern über
  // „Mannschaften verwalten“ bzw. die Saisonplanung.
  const supabase = await createClient();
  const { error } = await supabase
    .from("member_invites")
    .insert({ full_name, role, ...readInviteBirthday(formData) });

  if (error) {
    // Fehler sichtbar machen statt still zu scheitern.
    redirect(
      `/mitglieder/admin/beitritt?fehler=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/mitglieder/admin/beitritt");
  revalidatePath("/mitglieder/admin/mitglieder");
}

export async function updateInvite(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!id || !full_name) return;
  const roleRaw = String(formData.get("role") ?? "player");
  const role = ["admin", "editor", "player", "member"].includes(roleRaw)
    ? roleRaw
    : "player";
  // Von welcher Seite kam das Formular? (für Fehler-/Erfolgs-Banner)
  const zurueck =
    String(formData.get("zurueck") ?? "") === "beitritt"
      ? "/mitglieder/admin/beitritt"
      : "/mitglieder/admin/mitglieder";

  // team_ids bewusst NICHT anfassen – die Zuordnung wird unter
  // „Mannschaften verwalten“ bzw. in der Saisonplanung gepflegt.
  const supabase = await createClient();
  const { data: geaendert, error } = await supabase
    .from("member_invites")
    .update({ full_name, role, ...readInviteBirthday(formData) })
    .eq("id", id)
    .select("id");
  if (error || !geaendert?.length) {
    const grund = error
      ? /column|schema|constraint|violates/i.test(error.message)
        ? `Die Datenbank kennt ein Feld oder eine Rolle noch nicht – bitte supabase/ALLE_ERWEITERUNGEN.sql im SQL-Editor ausführen. (${error.message})`
        : error.message
      : "Keine Berechtigung oder Eintrag nicht gefunden.";
    redirect(`${zurueck}?fehler=${encodeURIComponent(grund)}`);
  }
  revalidatePath("/mitglieder/admin/beitritt");
  revalidatePath("/mitglieder/admin/mitglieder");
  redirect(`${zurueck}?gespeichert=${Date.now()}`);
}

export async function deleteInvite(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("member_invites").delete().eq("id", id);
  revalidatePath("/mitglieder/admin/beitritt");
  revalidatePath("/mitglieder/admin/mitglieder");
}

export async function regenerateTokenAction() {
  await requireAdmin();
  await regenerateJoinToken();
  revalidatePath("/mitglieder/admin/beitritt");
}
