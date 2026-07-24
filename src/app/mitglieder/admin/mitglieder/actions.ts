"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

  if (!full_name) {
    return { ok: false, message: "Bitte einen Namen angeben." };
  }

  const birthdayRaw = String(formData.get("birthday") ?? "");
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)
    ? birthdayRaw
    : null;
  const birthday_public = formData.get("birthday_public") === "on";
  const birthday_congrats = formData.get("birthday_congrats") === "on";
  const is_trainer = formData.get("is_trainer") === "on";
  const is_planner = formData.get("is_planner") === "on";
  const is_treasurer = formData.get("is_treasurer") === "on";

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
    // Mannschafts-Zuordnung läuft NICHT hier, sondern über
    // „Mannschaften verwalten“ bzw. die Saisonplanung.
    const { error } = await admin
      .from("member_invites")
      .insert({
        full_name,
        role,
        birthday,
        birthday_public,
        birthday_congrats,
        is_trainer,
        is_planner,
        is_treasurer,
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
    .update({
      full_name,
      role,
      email,
      birthday,
      birthday_public,
      birthday_congrats,
      is_trainer,
      is_planner,
      is_treasurer,
    })
    .eq("id", userId);

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
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const roleRaw = String(formData.get("role") ?? "player");
  const role = ["admin", "editor", "player", "member"].includes(roleRaw)
    ? roleRaw
    : "player";
  if (!id) return;

  // Sich selbst die Admin-Rolle entziehen: nicht erlaubt (sonst sperrt
  // man sich aus der Verwaltung aus).
  if (id === me.id && role !== "admin") {
    redirect(
      `/mitglieder/admin/mitglieder?fehler=${encodeURIComponent(
        "Du kannst dir nicht selbst die Admin-Rolle entziehen.",
      )}`,
    );
  }

  const admin = createAdminSupabase();
  const { error } = await admin.from("profiles").update({ role }).eq("id", id);
  if (error) {
    const text = /check constraint|violates/i.test(error.message)
      ? `Diese Rolle kennt die Datenbank noch nicht – bitte supabase/ALLE_ERWEITERUNGEN.sql im SQL-Editor ausführen. (${error.message})`
      : error.message;
    redirect(
      `/mitglieder/admin/mitglieder?fehler=${encodeURIComponent(text)}`,
    );
  }
  revalidatePath("/mitglieder/admin/mitglieder");
  redirect(`/mitglieder/admin/mitglieder?gespeichert=${Date.now()}`);
}

/** Admin bearbeitet die Stammdaten eines Mitglieds (inkl. Rolle). */
export async function updateMemberData(formData: FormData) {
  const me = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!id || !full_name) return;

  const birthdayRaw = String(formData.get("birthday") ?? "");
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)
    ? birthdayRaw
    : null;
  const leftRaw = String(formData.get("left_on") ?? "");
  const left_on = /^\d{4}-\d{2}-\d{2}$/.test(leftRaw) ? leftRaw : null;
  const sinceRaw = String(formData.get("member_since") ?? "");
  const member_since = /^\d{4}-\d{2}-\d{2}$/.test(sinceRaw) ? sinceRaw : null;

  const roleRaw = String(formData.get("role") ?? "");
  const role = ["admin", "editor", "player", "member"].includes(roleRaw)
    ? roleRaw
    : null;
  if (role && id === me.id && role !== "admin") {
    redirect(
      `/mitglieder/admin/mitglieder?fehler=${encodeURIComponent(
        "Du kannst dir nicht selbst die Admin-Rolle entziehen.",
      )}`,
    );
  }

  const admin = createAdminSupabase();
  const { error } = await admin
    .from("profiles")
    .update({
      full_name,
      // Rolle nur ändern, wenn das Formular sie mitschickt
      ...(role ? { role } : {}),
      phone: String(formData.get("phone") ?? "").trim(),
      birthday,
      birthday_public: formData.get("birthday_public") === "on",
      birthday_congrats: formData.get("birthday_congrats") === "on",
      is_trainer: formData.get("is_trainer") === "on",
      is_planner: formData.get("is_planner") === "on",
      is_treasurer: formData.get("is_treasurer") === "on",
      left_on,
      member_since,
    })
    .eq("id", id);
  if (error) {
    redirect(
      `/mitglieder/admin/mitglieder?fehler=${encodeURIComponent(error.message)}`,
    );
  }

  // Austrittsdatum schon erreicht? Dann sofort deaktivieren (sonst
  // erledigt es der tägliche Lauf am Stichtag). Sich selbst: nie.
  const heute = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (left_on && left_on <= heute && id !== me.id) {
    await admin.auth.admin.updateUserById(id, { ban_duration: "87600h" });
    await admin.from("profiles").update({ is_active: false }).eq("id", id);
  }

  revalidatePath("/mitglieder/admin/mitglieder");
  redirect(`/mitglieder/admin/mitglieder?gespeichert=${Date.now()}`);
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
    // Entsperren / wieder aktivieren – Austrittsdatum dabei löschen,
    // sonst würde der tägliche Lauf gleich wieder deaktivieren
    await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
    await admin
      .from("profiles")
      .update({ is_active: true, left_on: null })
      .eq("id", id);
  }
  revalidatePath("/mitglieder/admin/mitglieder");
}
