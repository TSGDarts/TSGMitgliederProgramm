"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slug";
import { parseIcal } from "@/lib/ical";

function revalidateTeams() {
  revalidatePath("/mitglieder/admin/mannschaften");
  revalidatePath("/mitglieder/mannschaften");
  revalidatePath("/mannschaften");
}

export async function createTeam(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const baseSlug = slugify(name) || "team";
  // Slug eindeutig machen.
  let slug = baseSlug;
  for (let i = 2; i < 50; i++) {
    const { data: existing } = await supabase
      .from("teams")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${baseSlug}-${i}`;
  }

  await supabase.from("teams").insert({
    name,
    slug,
    league: String(formData.get("league") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
  });
  revalidateTeams();
}

export async function updateTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("teams")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      league: String(formData.get("league") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      nuliga_url: String(formData.get("nuliga_url") ?? "").trim(),
      nuliga_ical_url: String(formData.get("nuliga_ical_url") ?? "").trim(),
    })
    .eq("id", id);
  revalidateTeams();
  revalidatePath(`/mitglieder/admin/mannschaften/${id}`);
}

export async function addRosterMember(formData: FormData) {
  await requireAdmin();
  const team_id = String(formData.get("team_id") ?? "");
  const profile_id = String(formData.get("profile_id") ?? "");
  if (!team_id || !profile_id) return;

  const supabase = await createClient();
  await supabase
    .from("team_members")
    .upsert({ team_id, profile_id }, { onConflict: "team_id,profile_id" });
  revalidatePath(`/mitglieder/admin/mannschaften/${team_id}`);
}

export async function removeRosterMember(formData: FormData) {
  await requireAdmin();
  const team_id = String(formData.get("team_id") ?? "");
  const profile_id = String(formData.get("profile_id") ?? "");
  if (!team_id || !profile_id) return;

  const supabase = await createClient();
  await supabase
    .from("team_members")
    .delete()
    .eq("team_id", team_id)
    .eq("profile_id", profile_id);
  revalidatePath(`/mitglieder/admin/mannschaften/${team_id}`);
}

/**
 * Setzt die Team-Rolle eines Spielers: 'captain', 'vice' oder 'none'.
 * Regeln: pro Team nur EIN Kapitän / EIN Vize, und eine Person kann jeweils
 * nur bei EINEM Team Kapitän bzw. Vize sein.
 */
export async function setTeamRole(formData: FormData) {
  await requireAdmin();
  const team_id = String(formData.get("team_id") ?? "");
  const profile_id = String(formData.get("profile_id") ?? "");
  const role = String(formData.get("team_role") ?? "none");
  if (!team_id || !profile_id) return;

  const supabase = await createClient();

  if (role === "captain") {
    await supabase
      .from("team_members")
      .update({ is_captain: false })
      .eq("profile_id", profile_id); // Person: bisherige Kapitänsrolle lösen
    await supabase
      .from("team_members")
      .update({ is_captain: false })
      .eq("team_id", team_id); // Team: bisherigen Kapitän lösen
    await supabase
      .from("team_members")
      .update({ is_captain: true, is_vice_captain: false })
      .eq("team_id", team_id)
      .eq("profile_id", profile_id);
  } else if (role === "vice") {
    await supabase
      .from("team_members")
      .update({ is_vice_captain: false })
      .eq("profile_id", profile_id);
    await supabase
      .from("team_members")
      .update({ is_vice_captain: false })
      .eq("team_id", team_id);
    await supabase
      .from("team_members")
      .update({ is_vice_captain: true, is_captain: false })
      .eq("team_id", team_id)
      .eq("profile_id", profile_id);
  } else {
    await supabase
      .from("team_members")
      .update({ is_captain: false, is_vice_captain: false })
      .eq("team_id", team_id)
      .eq("profile_id", profile_id);
  }

  revalidatePath(`/mitglieder/admin/mannschaften/${team_id}`);
}

export type ImportResult = { ok: boolean; message: string };

/** Liest den nuLiga-iCal-Feed einer Mannschaft und legt/aktualisiert die Termine. */
export async function importNuligaIcal(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireAdmin();
  const team_id = String(formData.get("team_id") ?? "");
  const url = String(formData.get("ical_url") ?? "").trim();
  if (!team_id || !url) {
    return { ok: false, message: "Keine iCal-Adresse hinterlegt." };
  }

  let text: string;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return { ok: false, message: `nuLiga antwortete mit Status ${res.status}.` };
    }
    text = await res.text();
  } catch {
    return { ok: false, message: "iCal-Feed konnte nicht geladen werden." };
  }

  const events = parseIcal(text);
  if (events.length === 0) {
    return { ok: false, message: "Keine Termine im Feed gefunden." };
  }

  const supabase = await createClient();
  const rows = events.map((e) => ({
    team_id,
    title: e.summary,
    description: e.description,
    location: e.location,
    type: "match" as const,
    starts_at: e.start,
    ends_at: e.end,
    source: "nuliga" as const,
    source_uid: `nuliga:${team_id}:${e.uid}`,
    is_public: true,
  }));

  const { error } = await supabase
    .from("events")
    .upsert(rows, { onConflict: "source_uid" });

  if (error) {
    return { ok: false, message: `Fehler beim Speichern: ${error.message}` };
  }

  revalidatePath("/mitglieder/termine");
  revalidatePath("/termine");
  return {
    ok: true,
    message: `${events.length} Termine aus nuLiga importiert/aktualisiert.`,
  };
}
