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
  const roleRaw = String(formData.get("role") ?? "player");
  const role = ["admin", "editor", "player", "member"].includes(roleRaw)
    ? roleRaw
    : "player";
  const teamIds = formData.getAll("team_ids").map(String).filter(Boolean);

  if (!full_name) {
    return { ok: false, message: "Bitte einen Namen angeben." };
  }

  const birthdayRaw = String(formData.get("birthday") ?? "");
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)
    ? birthdayRaw
    : null;
  const birthday_public = formData.get("birthday_public") === "on";
  const birthday_congrats = formData.get("birthday_congrats") === "on";

  // Ohne E-Mail: Name für die Selbst-Anmeldung anlegen. Die Person
  // registriert sich später über den Beitritts-Link/QR und gibt ihre
  // E-Mail dabei selbst an.
  if (!email) {
    let admin;
    try {
      admin = createAdminSupabase();
    } catch {
      return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY fehlt." };
    }
    const { error } = await admin
      .from("member_invites")
      .insert({
        full_name,
        role,
        team_ids: teamIds,
        birthday,
        birthday_public,
        birthday_congrats,
      });
    if (error) {
      return {
        ok: false,
        message: `Konnte nicht angelegt werden: ${error.message}. Falls die Tabelle fehlt: bitte supabase/ALLE_ERWEITERUNGEN.sql im SQL-Editor ausführen.`,
      };
    }
    revalidatePath("/mitglieder/admin/mitglieder");
    revalidatePath("/mitglieder/admin/beitritt");
    return {
      ok: true,
      message: `${full_name} wurde angelegt und wartet auf die Selbst-Anmeldung. Verteile den Beitritts-Link/QR (unter „Selbst-Anmeldung“ oder „App & Teilen“) – die E-Mail gibt die Person bei der Registrierung selbst an.`,
    };
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
    .update({ full_name, role, email, birthday, birthday_public, birthday_congrats })
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
  const roleRaw = String(formData.get("role") ?? "player");
  const role = ["admin", "editor", "player", "member"].includes(roleRaw)
    ? roleRaw
    : "player";
  if (!id) return;

  const admin = createAdminSupabase();
  await admin.from("profiles").update({ role }).eq("id", id);
  revalidatePath("/mitglieder/admin/mitglieder");
}

/** Admin bearbeitet die Stammdaten eines Mitglieds. */
export async function updateMemberData(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!id || !full_name) return;

  const birthdayRaw = String(formData.get("birthday") ?? "");
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)
    ? birthdayRaw
    : null;

  const admin = createAdminSupabase();
  await admin
    .from("profiles")
    .update({
      full_name,
      phone: String(formData.get("phone") ?? "").trim(),
      birthday,
      birthday_public: formData.get("birthday_public") === "on",
      birthday_congrats: formData.get("birthday_congrats") === "on",
      is_trainer: formData.get("is_trainer") === "on",
    })
    .eq("id", id);

  revalidatePath("/mitglieder/admin/mitglieder");
}

/** Löscht ein Mitglied endgültig (Login + Profil + alle Zuordnungen). */
export async function deleteMember(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id || id === me.id) return; // sich selbst löschen: nicht erlaubt

  const admin = createAdminSupabase();
  await admin.auth.admin.deleteUser(id);
  // Profil, Team-Zuordnungen, Zusagen usw. werden per "on delete cascade"
  // automatisch mit entfernt.
  revalidatePath("/mitglieder/admin/mitglieder");
}

/** Sperrt bzw. entsperrt den Login eines Mitglieds. */
export async function toggleMemberActive(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const currentlyActive = String(formData.get("is_active") ?? "") === "true";
  if (!id || id === me.id) return; // sich selbst sperren: nicht erlaubt

  const admin = createAdminSupabase();
  if (currentlyActive) {
    // Sperren: Login bei Supabase blockieren (sehr lange "Bann-Dauer")
    await admin.auth.admin.updateUserById(id, { ban_duration: "87600h" });
    await admin.from("profiles").update({ is_active: false }).eq("id", id);
  } else {
    // Entsperren
    await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
    await admin.from("profiles").update({ is_active: true }).eq("id", id);
  }
  revalidatePath("/mitglieder/admin/mitglieder");
}
