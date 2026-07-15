"use server";

// Schnelle Mannschafts-Aktionen für die Client-Planung: KEIN revalidatePath,
// die Oberfläche aktualisiert sich selbst (optimistisch).

import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type Res = { ok: boolean; message?: string };

/** Person ("p:<id>" Mitglied / "i:<id>" angelegter Name) einem Team zuordnen. */
export async function addTeamMemberAction(
  teamId: string,
  target: string,
): Promise<Res> {
  await requireAdmin();
  const [t, id] = target.split(":");
  if (!teamId || !id || (t !== "p" && t !== "i")) {
    return { ok: false, message: "Ungültige Angaben." };
  }

  const supabase = await createClient();
  if (t === "p") {
    const { error } = await supabase
      .from("team_members")
      .upsert(
        { team_id: teamId, profile_id: id },
        { onConflict: "team_id,profile_id" },
      );
    if (error) return { ok: false, message: error.message };
  } else {
    const { data } = await supabase
      .from("member_invites")
      .select("team_ids")
      .eq("id", id)
      .maybeSingle();
    const current = (data?.team_ids as string[]) ?? [];
    if (!current.includes(teamId)) {
      const { error } = await supabase
        .from("member_invites")
        .update({ team_ids: [...current, teamId] })
        .eq("id", id);
      if (error) return { ok: false, message: error.message };
    }
  }
  return { ok: true };
}

/**
 * Team-Rolle setzen: 'captain', 'vice' oder 'none'.
 * Regeln: pro Team nur EIN Kapitän / EIN Vize; eine Person nur bei
 * EINEM Team Kapitän bzw. Vize. Nur für registrierte Mitglieder.
 */
export async function setTeamRoleAction(
  teamId: string,
  target: string,
  role: "captain" | "vice" | "none",
): Promise<Res> {
  await requireAdmin();
  const [t, id] = target.split(":");
  if (t !== "p" || !id || !teamId) {
    return {
      ok: false,
      message: "Kapitän geht erst, wenn die Person registriert ist.",
    };
  }

  const supabase = await createClient();
  if (role === "captain") {
    await supabase
      .from("team_members")
      .update({ is_captain: false })
      .eq("profile_id", id);
    await supabase
      .from("team_members")
      .update({ is_captain: false })
      .eq("team_id", teamId);
    const { error } = await supabase
      .from("team_members")
      .update({ is_captain: true, is_vice_captain: false })
      .eq("team_id", teamId)
      .eq("profile_id", id);
    if (error) return { ok: false, message: error.message };
  } else if (role === "vice") {
    await supabase
      .from("team_members")
      .update({ is_vice_captain: false })
      .eq("profile_id", id);
    await supabase
      .from("team_members")
      .update({ is_vice_captain: false })
      .eq("team_id", teamId);
    const { error } = await supabase
      .from("team_members")
      .update({ is_vice_captain: true, is_captain: false })
      .eq("team_id", teamId)
      .eq("profile_id", id);
    if (error) return { ok: false, message: error.message };
  } else {
    const { error } = await supabase
      .from("team_members")
      .update({ is_captain: false, is_vice_captain: false })
      .eq("team_id", teamId)
      .eq("profile_id", id);
    if (error) return { ok: false, message: error.message };
  }
  return { ok: true };
}

/** Person von einem Team in ein anderes verschieben (Drag & Drop). */
export async function moveTeamMemberAction(
  fromTeamId: string | null,
  toTeamId: string,
  target: string,
): Promise<Res> {
  const add = await addTeamMemberAction(toTeamId, target);
  if (!add.ok) return add;
  if (fromTeamId && fromTeamId !== toTeamId) {
    return removeTeamMemberAction(fromTeamId, target);
  }
  return { ok: true };
}

export async function removeTeamMemberAction(
  teamId: string,
  target: string,
): Promise<Res> {
  await requireAdmin();
  const [t, id] = target.split(":");
  if (!teamId || !id || (t !== "p" && t !== "i")) {
    return { ok: false, message: "Ungültige Angaben." };
  }

  const supabase = await createClient();
  if (t === "p") {
    const { error } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", teamId)
      .eq("profile_id", id);
    if (error) return { ok: false, message: error.message };
  } else {
    const { data } = await supabase
      .from("member_invites")
      .select("team_ids")
      .eq("id", id)
      .maybeSingle();
    const current = (data?.team_ids as string[]) ?? [];
    const { error } = await supabase
      .from("member_invites")
      .update({ team_ids: current.filter((x) => x !== teamId) })
      .eq("id", id);
    if (error) return { ok: false, message: error.message };
  }
  return { ok: true };
}
