"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { regenerateJoinToken } from "@/lib/invites";

export async function addInviteName(formData: FormData) {
  await requireAdmin();
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return;
  const role =
    String(formData.get("role") ?? "player") === "admin" ? "admin" : "player";
  const team_ids = formData.getAll("team_ids").map(String).filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase
    .from("member_invites")
    .insert({ full_name, role, team_ids });

  if (error) {
    // Fehler sichtbar machen statt still zu scheitern.
    redirect(
      `/mitglieder/admin/beitritt?fehler=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath("/mitglieder/admin/beitritt");
  revalidatePath("/mitglieder/admin/mitglieder");
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
