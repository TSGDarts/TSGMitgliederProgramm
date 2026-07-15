"use server";

// Schnelle Pokal-Aktionen für die Client-Planung: KEIN revalidatePath,
// die Oberfläche aktualisiert sich selbst (optimistisch) – dadurch
// reagieren Zuordnen/Entfernen sofort.

import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const KINDS = ["ku", "8er"] as const;

export type AddResult = {
  ok: boolean;
  message?: string;
  added: { target: string; id: string }[];
};

/** Personen ("p:<id>" / "i:<id>") einem Pokal-Team zuordnen. */
export async function addPokalManyAction(
  seasonId: string,
  kindRaw: string,
  teamNo: number,
  targets: string[],
): Promise<AddResult> {
  await requireAdmin();
  const kind = KINDS.find((k) => k === kindRaw);
  const team_no = Math.min(Math.max(Math.round(teamNo) || 1, 1), 6);
  if (!seasonId || !kind || targets.length === 0) {
    return { ok: false, message: "Ungültige Angaben.", added: [] };
  }

  const supabase = await createClient();
  const added: { target: string; id: string }[] = [];
  let lastError = "";

  for (const target of targets.slice(0, 100)) {
    const [t, id] = target.split(":");
    if ((t !== "p" && t !== "i") || !id) continue;
    const { data, error } = await supabase
      .from("pokal_squads")
      .insert({
        season_id: seasonId,
        kind,
        team_no,
        profile_id: t === "p" ? id : null,
        invite_id: t === "i" ? id : null,
      })
      .select("id")
      .single();
    if (data?.id) {
      added.push({ target, id: data.id as string });
    } else if (error && !error.message.includes("duplicate")) {
      lastError = error.message;
    }
  }

  if (added.length === 0 && lastError) {
    return { ok: false, message: `Fehler: ${lastError}`, added };
  }
  return { ok: true, added };
}

export async function removePokalAction(
  rowId: string,
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  if (!rowId) return { ok: false, message: "Kein Eintrag angegeben." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("pokal_squads")
    .delete()
    .eq("id", rowId);
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Anzahl der Mannschaften eines Pokals setzen (1–6). */
export async function setPokalTeamsAction(
  seasonId: string,
  kindRaw: string,
  count: number,
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin();
  const kind = KINDS.find((k) => k === kindRaw);
  const n = Math.min(Math.max(Math.round(count) || 1, 1), 6);
  if (!seasonId || !kind) return { ok: false, message: "Ungültige Angaben." };

  const supabase = await createClient();
  const column = kind === "ku" ? "pokal_ku_teams" : "pokal_8er_teams";
  const { error } = await supabase
    .from("seasons")
    .update({ [column]: n })
    .eq("id", seasonId);
  if (error) return { ok: false, message: error.message };

  // Zuordnungen in weggefallenen Teams ins letzte verbleibende Team schieben.
  await supabase
    .from("pokal_squads")
    .update({ team_no: n })
    .eq("season_id", seasonId)
    .eq("kind", kind)
    .gt("team_no", n);

  return { ok: true };
}
