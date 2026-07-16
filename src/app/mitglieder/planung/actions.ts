"use server";

// Aktionen für die Saisonplanungs-Entwürfe: Jeder berechtigte Planer
// pflegt SEINEN Entwurf (season_plans, ein Entwurf je Person und Saison).
// Die Tabelle ist nur über den Server erreichbar (RLS ohne Policies) –
// die Berechtigung wird hier im Code geprüft.

import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin, canPlanSeason } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";

type Res = { ok: boolean; message?: string };

export type EntwurfZuordnung = {
  teamId: string;
  key: string; // "p:<profilId>" | "i:<inviteId>"
  role: "captain" | "vice" | null;
};

function bereinigeZuordnungen(roh: unknown): EntwurfZuordnung[] {
  if (!Array.isArray(roh)) return [];
  const sauber: EntwurfZuordnung[] = [];
  for (const a of roh.slice(0, 500)) {
    const teamId = String((a as EntwurfZuordnung)?.teamId ?? "");
    const key = String((a as EntwurfZuordnung)?.key ?? "");
    const roleRaw = (a as EntwurfZuordnung)?.role ?? null;
    if (!teamId || !/^[pi]:.+/.test(key)) continue;
    sauber.push({
      teamId,
      key,
      role: roleRaw === "captain" || roleRaw === "vice" ? roleRaw : null,
    });
  }
  return sauber;
}

/** Eigenen Entwurf speichern (Zuordnungen + Notizen). */
export async function speicherEntwurf(
  seasonId: string,
  zuordnungen: EntwurfZuordnung[],
  notizen: string,
): Promise<Res> {
  const profile = await requireProfile();
  if (!canPlanSeason(profile)) {
    return { ok: false, message: "Keine Berechtigung für die Saisonplanung." };
  }
  if (!seasonId) return { ok: false, message: "Saison fehlt." };

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY fehlt." };
  }

  const { error } = await admin.from("season_plans").upsert(
    {
      season_id: seasonId,
      owner_id: profile.id,
      data: { assign: bereinigeZuordnungen(zuordnungen) },
      notes: String(notizen ?? "").slice(0, 5000),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "season_id,owner_id" },
  );
  if (error) {
    const text = /relation|schema|column/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    return { ok: false, message: text };
  }
  return { ok: true };
}

/**
 * Entwurf in die ECHTEN Mannschaften übernehmen (nur Admin): ersetzt die
 * Kader aller Mannschaften (Mitglieder + vorab angelegte Namen) durch die
 * Zuordnungen des Entwurfs, inklusive Kapitäns-/Vize-Rollen.
 */
export async function uebernehmeEntwurf(planId: string): Promise<Res> {
  await requireAdmin();
  if (!planId) return { ok: false, message: "Entwurf fehlt." };

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY fehlt." };
  }

  const { data: plan } = await admin
    .from("season_plans")
    .select("*")
    .eq("id", planId)
    .maybeSingle();
  if (!plan) return { ok: false, message: "Entwurf nicht gefunden." };
  const assign = bereinigeZuordnungen(
    (plan.data as { assign?: unknown })?.assign,
  );

  const { data: teamData } = await admin.from("teams").select("id");
  const teamIds = (teamData ?? []).map((t) => t.id as string);
  if (teamIds.length === 0) {
    return { ok: false, message: "Es gibt keine Mannschaften." };
  }

  // Nur Zuordnungen zu existierenden Teams übernehmen
  const teamSet = new Set(teamIds);
  const gueltig = assign.filter((a) => teamSet.has(a.teamId));

  // 1) Registrierte Mitglieder: Kader komplett ersetzen
  const { error: delError } = await admin
    .from("team_members")
    .delete()
    .in("team_id", teamIds);
  if (delError) return { ok: false, message: delError.message };

  const profilZeilen = gueltig
    .filter((a) => a.key.startsWith("p:"))
    .map((a) => ({
      team_id: a.teamId,
      profile_id: a.key.slice(2),
      is_captain: a.role === "captain",
      is_vice_captain: a.role === "vice",
    }));
  if (profilZeilen.length) {
    const { error } = await admin
      .from("team_members")
      .upsert(profilZeilen, { onConflict: "team_id,profile_id" });
    if (error) return { ok: false, message: error.message };
  }

  // 2) Vorab angelegte Namen: Team-Zuordnung + Rollen aus dem Entwurf
  const { data: invData } = await admin
    .from("member_invites")
    .select("id, role, team_ids, captain_of, vice_of")
    .eq("claimed", false);
  for (const inv of invData ?? []) {
    if ((inv.role as string) === "member") continue; // ohne Liga: nicht anfassen
    const meine = gueltig.filter((a) => a.key === `i:${inv.id}`);
    const neueTeams = [...new Set(meine.map((a) => a.teamId))];
    const captainOf = meine.find((a) => a.role === "captain")?.teamId ?? null;
    const viceOf = meine.find((a) => a.role === "vice")?.teamId ?? null;
    const alteTeams = ((inv.team_ids as string[]) ?? []).slice().sort();
    const unveraendert =
      JSON.stringify(alteTeams) === JSON.stringify([...neueTeams].sort()) &&
      (inv.captain_of ?? null) === captainOf &&
      (inv.vice_of ?? null) === viceOf;
    if (unveraendert) continue;
    const { error } = await admin
      .from("member_invites")
      .update({ team_ids: neueTeams, captain_of: captainOf, vice_of: viceOf })
      .eq("id", inv.id);
    if (error) return { ok: false, message: error.message };
  }

  revalidatePath("/mitglieder/planung");
  revalidatePath("/mitglieder/mannschaften");
  revalidatePath("/mitglieder/admin/mannschaften");
  revalidatePath(`/mitglieder/admin/saisons/${plan.season_id}`);
  return { ok: true, message: "Entwurf wurde in die Mannschaften übernommen." };
}
