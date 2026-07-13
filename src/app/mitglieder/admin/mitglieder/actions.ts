"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/supabase/config";

export type CreateMemberResult = {
  ok: boolean;
  message: string;
  inviteUrl?: string;
};

/** Erzeugt einen Einladungslink, mit dem die Person ihr Passwort selbst setzt. */
async function buildPasswordLink(
  admin: ReturnType<typeof createAdminSupabase>,
  email: string,
): Promise<string | null> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: {
      redirectTo: `${siteUrl}/auth/callback?next=/passwort-setzen`,
    },
  });
  const hashed = data?.properties?.hashed_token;
  if (error || !hashed) return null;
  return `${siteUrl}/auth/callback?token_hash=${hashed}&type=recovery&next=${encodeURIComponent(
    "/passwort-setzen",
  )}`;
}

export async function createMember(
  _prev: CreateMemberResult | null,
  formData: FormData,
): Promise<CreateMemberResult> {
  await requireAdmin();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "player") === "admin"
    ? "admin"
    : "player";
  const teamIds = formData.getAll("team_ids").map(String).filter(Boolean);

  if (!email || !full_name) {
    return { ok: false, message: "Name und E-Mail sind erforderlich." };
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return {
      ok: false,
      message:
        "SUPABASE_SERVICE_ROLE_KEY fehlt. Bitte in den Umgebungsvariablen hinterlegen.",
    };
  }

  // Nutzer anlegen (ohne Passwort – das setzt die Person selbst).
  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

  if (createErr || !created?.user) {
    return {
      ok: false,
      message:
        createErr?.message?.includes("already") || createErr?.status === 422
          ? "Diese E-Mail ist bereits vergeben."
          : `Fehler beim Anlegen: ${createErr?.message ?? "unbekannt"}`,
    };
  }

  const userId = created.user.id;

  // Profil vervollständigen (Trigger legt Grunddaten an).
  await admin
    .from("profiles")
    .update({ full_name, role, email })
    .eq("id", userId);

  // Mannschaften zuordnen.
  if (teamIds.length) {
    await admin.from("team_members").insert(
      teamIds.map((team_id) => ({ team_id, profile_id: userId })),
    );
  }

  const inviteUrl = await buildPasswordLink(admin, email);

  revalidatePath("/mitglieder/admin/mitglieder");

  return {
    ok: true,
    message: `Zugang für ${full_name} angelegt. Sende der Person den Link – damit setzt sie ihr Passwort.`,
    inviteUrl: inviteUrl ?? undefined,
  };
}

export async function regenerateLink(
  _prev: CreateMemberResult | null,
  formData: FormData,
): Promise<CreateMemberResult> {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { ok: false, message: "E-Mail fehlt." };

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY fehlt." };
  }

  const inviteUrl = await buildPasswordLink(admin, email);
  if (!inviteUrl) {
    return { ok: false, message: "Link konnte nicht erzeugt werden." };
  }
  return { ok: true, message: "Neuer Link erzeugt.", inviteUrl };
}

export async function setMemberRole(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "player") === "admin"
    ? "admin"
    : "player";
  if (!id) return;

  const admin = createAdminSupabase();
  await admin.from("profiles").update({ role }).eq("id", id);
  revalidatePath("/mitglieder/admin/mitglieder");
}
