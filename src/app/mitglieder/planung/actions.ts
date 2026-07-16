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

export type PokalEntwurf = {
  kind: string; // "ku" | "8er"
  teams: number; // Anzahl Pokal-Teams (1–6)
  zuordnungen: { teamNo: number; key: string; captain: boolean }[];
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

function bereinigePokal(roh: unknown): PokalEntwurf | null {
  const p = roh as PokalEntwurf | null;
  if (!p || (p.kind !== "ku" && p.kind !== "8er")) return null;
  const teams = Math.min(Math.max(Math.round(Number(p.teams)) || 1, 1), 6);
  const zuordnungen = (Array.isArray(p.zuordnungen) ? p.zuordnungen : [])
    .slice(0, 200)
    .flatMap((z) => {
      const key = String(z?.key ?? "");
      const teamNo = Math.min(Math.max(Math.round(Number(z?.teamNo)) || 1, 1), 6);
      if (!/^[pi]:.+/.test(key)) return [];
      return [{ teamNo, key, captain: !!z?.captain }];
    });
  return { kind: p.kind, teams, zuordnungen };
}

/**
 * Eigenen Entwurf speichern. Es wird nur der mitgeschickte Teil geändert
 * (Mannschaften, Notizen oder EIN Pokal) – der Rest des Entwurfs bleibt,
 * damit sich die Bereiche nicht gegenseitig überschreiben.
 */
export async function speicherEntwurf(
  seasonId: string,
  patch: {
    assign?: EntwurfZuordnung[];
    notes?: string;
    pokal?: PokalEntwurf;
  },
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

  const { data: vorhanden } = await admin
    .from("season_plans")
    .select("data, notes")
    .eq("season_id", seasonId)
    .eq("owner_id", profile.id)
    .maybeSingle();
  const daten = ((vorhanden?.data as Record<string, unknown>) ?? {});

  if (patch.assign !== undefined) {
    daten.assign = bereinigeZuordnungen(patch.assign);
  }
  if (patch.pokal !== undefined) {
    const pokal = bereinigePokal(patch.pokal);
    if (pokal) {
      daten.pokal = {
        ...((daten.pokal as Record<string, unknown>) ?? {}),
        [pokal.kind]: pokal,
      };
    }
  }
  const notes =
    patch.notes !== undefined
      ? String(patch.notes ?? "").slice(0, 5000)
      : ((vorhanden?.notes as string) ?? "");

  const { error } = await admin.from("season_plans").upsert(
    {
      season_id: seasonId,
      owner_id: profile.id,
      data: daten,
      notes,
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

  // 3) Pokal-Entwürfe (falls im Entwurf enthalten): Kader ersetzen
  const pokalDaten = ((plan.data as { pokal?: Record<string, unknown> })
    ?.pokal ?? {}) as Record<
    string,
    { teams?: number; zuordnungen?: { teamNo: number; key: string; captain: boolean }[] }
  >;
  for (const kind of ["ku", "8er"]) {
    const p = pokalDaten[kind];
    if (!p) continue;
    const teams = Math.min(Math.max(Math.round(Number(p.teams)) || 1, 1), 6);
    const spalte = kind === "ku" ? "pokal_ku_teams" : "pokal_8er_teams";
    await admin
      .from("seasons")
      .update({ [spalte]: teams })
      .eq("id", plan.season_id);
    const { error: delPokal } = await admin
      .from("pokal_squads")
      .delete()
      .eq("season_id", plan.season_id)
      .eq("kind", kind);
    if (delPokal) return { ok: false, message: delPokal.message };
    for (const z of p.zuordnungen ?? []) {
      const key = String(z?.key ?? "");
      if (!/^[pi]:.+/.test(key)) continue;
      const id = key.slice(2);
      await admin.from("pokal_squads").insert({
        season_id: plan.season_id,
        kind,
        team_no: Math.min(Math.max(Math.round(Number(z.teamNo)) || 1, 1), 6),
        profile_id: key.startsWith("p:") ? id : null,
        invite_id: key.startsWith("i:") ? id : null,
        is_captain: !!z.captain,
      });
    }
  }

  revalidatePath("/mitglieder/planung");
  revalidatePath("/mitglieder/mannschaften");
  revalidatePath("/mitglieder/admin/mannschaften");
  revalidatePath(`/mitglieder/admin/saisons/${plan.season_id}`);
  return {
    ok: true,
    message: "Entwurf wurde in die Mannschaften (und Pokale) übernommen.",
  };
}
