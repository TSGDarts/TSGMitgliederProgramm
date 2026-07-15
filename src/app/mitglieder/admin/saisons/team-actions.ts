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

/** Tauscht die kompletten Kader zweier Mannschaften (inkl. Rollen). */
export async function swapTeamsAction(
  teamAId: string,
  teamBId: string,
): Promise<Res> {
  await requireAdmin();
  if (!teamAId || !teamBId || teamAId === teamBId) {
    return { ok: false, message: "Bitte zwei verschiedene Teams wählen." };
  }

  const supabase = await createClient();

  // Registrierte Mitglieder: nur die tauschen, die nicht in beiden Teams sind
  const [{ data: rowsA }, { data: rowsB }] = await Promise.all([
    supabase.from("team_members").select("profile_id").eq("team_id", teamAId),
    supabase.from("team_members").select("profile_id").eq("team_id", teamBId),
  ]);
  const setA = new Set((rowsA ?? []).map((r) => r.profile_id as string));
  const setB = new Set((rowsB ?? []).map((r) => r.profile_id as string));
  const onlyA = [...setA].filter((x) => !setB.has(x));
  const onlyB = [...setB].filter((x) => !setA.has(x));

  if (onlyA.length) {
    const { error } = await supabase
      .from("team_members")
      .update({ team_id: teamBId })
      .eq("team_id", teamAId)
      .in("profile_id", onlyA);
    if (error) return { ok: false, message: error.message };
  }
  if (onlyB.length) {
    const { error } = await supabase
      .from("team_members")
      .update({ team_id: teamAId })
      .eq("team_id", teamBId)
      .in("profile_id", onlyB);
    if (error) return { ok: false, message: error.message };
  }

  // Vorab angelegte Namen: Team-IDs (und Kapitäns-Rollen) tauschen
  const { data: invs } = await supabase
    .from("member_invites")
    .select("*")
    .eq("claimed", false);
  for (const inv of invs ?? []) {
    const ids = (inv.team_ids as string[]) ?? [];
    const cap = (inv.captain_of as string | null) ?? null;
    const vice = (inv.vice_of as string | null) ?? null;
    const touches =
      ids.includes(teamAId) ||
      ids.includes(teamBId) ||
      cap === teamAId ||
      cap === teamBId ||
      vice === teamAId ||
      vice === teamBId;
    if (!touches) continue;

    const flip = (x: string | null) =>
      x === teamAId ? teamBId : x === teamBId ? teamAId : x;
    const patch: Record<string, unknown> = {
      team_ids: [...new Set(ids.map((x) => flip(x) as string))],
    };
    if (cap === teamAId || cap === teamBId) patch.captain_of = flip(cap);
    if (vice === teamAId || vice === teamBId) patch.vice_of = flip(vice);

    await supabase.from("member_invites").update(patch).eq("id", inv.id);
  }

  return { ok: true };
}

/**
 * Team-Rolle setzen: 'captain', 'vice' oder 'none' – für registrierte
 * Mitglieder UND vorab angelegte Namen (member_invites.captain_of/vice_of).
 * Regeln: pro Team nur EIN Kapitän / EIN Vize; eine Person nur bei
 * EINEM Team Kapitän bzw. Vize.
 */
export async function setTeamRoleAction(
  teamId: string,
  target: string,
  role: "captain" | "vice" | "none",
): Promise<Res> {
  await requireAdmin();
  const [t, id] = target.split(":");
  if ((t !== "p" && t !== "i") || !id || !teamId) {
    return { ok: false, message: "Ungültige Angaben." };
  }

  const supabase = await createClient();

  if (role === "captain" || role === "vice") {
    const memberCol = role === "captain" ? "is_captain" : "is_vice_captain";
    const inviteCol = role === "captain" ? "captain_of" : "vice_of";

    // Diese Rolle im Team bei allen anderen lösen (Mitglieder + Namen)
    await supabase
      .from("team_members")
      .update({ [memberCol]: false })
      .eq("team_id", teamId);
    await supabase
      .from("member_invites")
      .update({ [inviteCol]: null })
      .eq(inviteCol, teamId);

    if (t === "p") {
      // Eine Person nur bei einem Team in dieser Rolle
      await supabase
        .from("team_members")
        .update({ [memberCol]: false })
        .eq("profile_id", id);
      const { error } = await supabase
        .from("team_members")
        .update(
          role === "captain"
            ? { is_captain: true, is_vice_captain: false }
            : { is_vice_captain: true, is_captain: false },
        )
        .eq("team_id", teamId)
        .eq("profile_id", id);
      if (error) return { ok: false, message: error.message };
    } else {
      // Nicht gleichzeitig Kapitän UND Vize desselben Teams
      const { data: cur } = await supabase
        .from("member_invites")
        .select("captain_of, vice_of")
        .eq("id", id)
        .maybeSingle();
      const patch: Record<string, string | null> = { [inviteCol]: teamId };
      if (role === "captain" && cur?.vice_of === teamId) patch.vice_of = null;
      if (role === "vice" && cur?.captain_of === teamId) patch.captain_of = null;
      const { error } = await supabase
        .from("member_invites")
        .update(patch)
        .eq("id", id);
      if (error) {
        return {
          ok: false,
          message: `${error.message} – falls die Spalten fehlen: bitte supabase/13_kapitaen_vorab.sql ausführen.`,
        };
      }
    }
  } else {
    // Rolle entfernen
    if (t === "p") {
      const { error } = await supabase
        .from("team_members")
        .update({ is_captain: false, is_vice_captain: false })
        .eq("team_id", teamId)
        .eq("profile_id", id);
      if (error) return { ok: false, message: error.message };
    } else {
      const { data: cur } = await supabase
        .from("member_invites")
        .select("captain_of, vice_of")
        .eq("id", id)
        .maybeSingle();
      const patch: Record<string, null> = {};
      if (cur?.captain_of === teamId) patch.captain_of = null;
      if (cur?.vice_of === teamId) patch.vice_of = null;
      if (Object.keys(patch).length) {
        const { error } = await supabase
          .from("member_invites")
          .update(patch)
          .eq("id", id);
        if (error) return { ok: false, message: error.message };
      }
    }
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
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const current = (data?.team_ids as string[]) ?? [];
    const patch: Record<string, unknown> = {
      team_ids: current.filter((x) => x !== teamId),
    };
    // Kapitäns-Rolle für dieses Team mit entfernen
    if ((data?.captain_of as string | null) === teamId) patch.captain_of = null;
    if ((data?.vice_of as string | null) === teamId) patch.vice_of = null;
    const { error } = await supabase
      .from("member_invites")
      .update(patch)
      .eq("id", id);
    if (error) return { ok: false, message: error.message };
  }
  return { ok: true };
}
