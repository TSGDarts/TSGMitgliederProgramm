"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseSurveyAnswers } from "@/lib/season";
import type { EventRow } from "@/lib/types";

export type AdminSurveyResult = { ok: boolean; message: string };

/**
 * Admin trägt die Saisonabfrage-Antworten eines Mitglieds ein oder
 * bearbeitet sie – unabhängig davon, ob die Abfrage gerade offen ist
 * (z. B. zum Übertragen einer bereits per Forms durchgeführten Umfrage).
 */
export async function adminSaveSurvey(
  _prev: AdminSurveyResult | null,
  formData: FormData,
): Promise<AdminSurveyResult> {
  await requireAdmin();

  const seasonId = String(formData.get("season_id") ?? "");
  const profileId = String(formData.get("profile_id") ?? "");
  const inviteId = String(formData.get("invite_id") ?? "");
  if (!seasonId || (!profileId && !inviteId)) {
    return { ok: false, message: "Saison oder Person fehlt." };
  }

  const supabase = await createClient();
  const answers = parseSurveyAnswers(formData);
  const updated_at = new Date().toISOString();

  const { error } = profileId
    ? await supabase.from("survey_responses").upsert(
        { season_id: seasonId, profile_id: profileId, updated_at, ...answers },
        { onConflict: "season_id,profile_id" },
      )
    : await supabase.from("survey_responses_invites").upsert(
        { season_id: seasonId, invite_id: inviteId, updated_at, ...answers },
        { onConflict: "season_id,invite_id" },
      );

  if (error) {
    return {
      ok: false,
      message: `Fehler beim Speichern: ${error.message}${
        error.message.includes("survey_responses_invites")
          ? " – bitte supabase/08_abfrage_nachtrag.sql (oder ALLE_ERWEITERUNGEN.sql) ausführen."
          : ""
      }`,
    };
  }

  revalidatePath(`/mitglieder/admin/saisons/${seasonId}`);
  revalidatePath("/mitglieder/saisonabfrage");
  revalidatePath("/mitglieder");
  return { ok: true, message: "Antworten gespeichert." };
}

/** Person (Mitglied oder angelegter Name) einem Pokal-Kader zuordnen. */
export async function addPokal(formData: FormData) {
  await requireAdmin();
  const season_id = String(formData.get("season_id") ?? "");
  const kindRaw = String(formData.get("kind") ?? "");
  const kind = ["ku", "8er"].includes(kindRaw) ? kindRaw : "";
  const target = String(formData.get("target") ?? ""); // "p:<id>" oder "i:<id>"
  const [t, id] = target.split(":");
  if (!season_id || !kind || !id || (t !== "p" && t !== "i")) return;

  const row = {
    season_id,
    kind,
    profile_id: t === "p" ? id : null,
    invite_id: t === "i" ? id : null,
  };

  const supabase = await createClient();
  await supabase.from("pokal_squads").insert(row); // Duplikate scheitern still
  revalidatePath(`/mitglieder/admin/saisons/${season_id}`);
}

export async function removePokal(formData: FormData) {
  await requireAdmin();
  const season_id = String(formData.get("season_id") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("pokal_squads").delete().eq("id", id);
  revalidatePath(`/mitglieder/admin/saisons/${season_id}`);
}

/** Team-Zuordnung für vorab angelegte (noch nicht registrierte) Namen. */
export async function assignInviteTeam(formData: FormData) {
  await requireAdmin();
  const season_id = String(formData.get("season_id") ?? "");
  const invite_id = String(formData.get("invite_id") ?? "");
  const team_id = String(formData.get("team_id") ?? "");
  if (!invite_id || !team_id) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("member_invites")
    .select("team_ids")
    .eq("id", invite_id)
    .maybeSingle();
  const current = (data?.team_ids as string[]) ?? [];
  if (!current.includes(team_id)) {
    await supabase
      .from("member_invites")
      .update({ team_ids: [...current, team_id] })
      .eq("id", invite_id);
  }
  revalidatePath(`/mitglieder/admin/saisons/${season_id}`);
  revalidatePath("/mitglieder/admin/beitritt");
}

export async function unassignInviteTeam(formData: FormData) {
  await requireAdmin();
  const season_id = String(formData.get("season_id") ?? "");
  const invite_id = String(formData.get("invite_id") ?? "");
  const team_id = String(formData.get("team_id") ?? "");
  if (!invite_id || !team_id) return;

  const supabase = await createClient();
  const { data } = await supabase
    .from("member_invites")
    .select("team_ids")
    .eq("id", invite_id)
    .maybeSingle();
  const current = (data?.team_ids as string[]) ?? [];
  await supabase
    .from("member_invites")
    .update({ team_ids: current.filter((t) => t !== team_id) })
    .eq("id", invite_id);
  revalidatePath(`/mitglieder/admin/saisons/${season_id}`);
  revalidatePath("/mitglieder/admin/beitritt");
}

export async function createSeason(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const starts_on = String(formData.get("starts_on") ?? "") || null;
  const ends_on = String(formData.get("ends_on") ?? "") || null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("seasons")
    .insert({ name, starts_on, ends_on })
    .select("id")
    .single();

  revalidatePath("/mitglieder/admin/saisons");
  if (data?.id) redirect(`/mitglieder/admin/saisons/${data.id}`);
}

export async function toggleSurvey(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const open = String(formData.get("open") ?? "") === "true";
  if (!id) return;

  const supabase = await createClient();
  // Nur eine Abfrage gleichzeitig offen halten.
  if (open) {
    await supabase
      .from("seasons")
      .update({ survey_open: false })
      .eq("survey_open", true);
  }
  await supabase.from("seasons").update({ survey_open: open }).eq("id", id);
  revalidatePath(`/mitglieder/admin/saisons/${id}`);
  revalidatePath("/mitglieder/admin/saisons");
  revalidatePath("/mitglieder/saisonabfrage");
  revalidatePath("/mitglieder");
}

export async function assignTeam(formData: FormData) {
  await requireAdmin();
  const season_id = String(formData.get("season_id") ?? "");
  const team_id = String(formData.get("team_id") ?? "");
  const profile_id = String(formData.get("profile_id") ?? "");
  if (!team_id || !profile_id) return;

  const supabase = await createClient();
  await supabase
    .from("team_members")
    .upsert({ team_id, profile_id }, { onConflict: "team_id,profile_id" });
  revalidatePath(`/mitglieder/admin/saisons/${season_id}`);
}

export async function unassignTeam(formData: FormData) {
  await requireAdmin();
  const season_id = String(formData.get("season_id") ?? "");
  const team_id = String(formData.get("team_id") ?? "");
  const profile_id = String(formData.get("profile_id") ?? "");
  if (!team_id || !profile_id) return;

  const supabase = await createClient();
  await supabase
    .from("team_members")
    .delete()
    .eq("team_id", team_id)
    .eq("profile_id", profile_id);
  revalidatePath(`/mitglieder/admin/saisons/${season_id}`);
}

/**
 * Schließt eine Saison ab: erstellt für jedes Team einen Archiv-Schnappschuss
 * (Kader + Termin-/Zusagen-Statistik) und markiert die Saison als archiviert.
 * Die Teams selbst bleiben bestehen und können für die neue Saison
 * angepasst werden.
 */
export async function archiveSeason(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { data: season } = await supabase
    .from("seasons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!season || season.status === "archived") return;

  const { data: teamsData } = await supabase.from("teams").select("*");
  const teams = teamsData ?? [];

  for (const team of teams) {
    // Kader
    const { data: members } = await supabase
      .from("team_members")
      .select("profile_id,is_captain,is_vice_captain,profiles(full_name,email)")
      .eq("team_id", team.id);
    const roster = (members ?? []).map((m) => {
      const p = m.profiles as unknown as { full_name: string; email: string | null };
      return {
        name: p?.full_name || p?.email || "?",
        captain: Boolean(m.is_captain),
        vice: Boolean(m.is_vice_captain),
      };
    });

    // Termine im Saison-Zeitraum (falls kein Zeitraum: alle bisherigen)
    let evQuery = supabase
      .from("events")
      .select("id")
      .eq("team_id", team.id);
    if (season.starts_on) evQuery = evQuery.gte("starts_at", season.starts_on);
    if (season.ends_on) evQuery = evQuery.lte("starts_at", `${season.ends_on}T23:59:59Z`);
    const { data: events } = await evQuery;
    const eventIds = ((events as Pick<EventRow, "id">[]) ?? []).map((e) => e.id);

    // Zu-/Absagen zählen
    const counts = { zusagen: 0, absagen: 0, vielleicht: 0 };
    const perPlayer = new Map<
      string,
      { name: string; zusagen: number; absagen: number; vielleicht: number }
    >();
    if (eventIds.length) {
      const { data: rsvps } = await supabase
        .from("rsvps")
        .select("status,profile_id,profiles(full_name)")
        .in("event_id", eventIds);
      for (const r of rsvps ?? []) {
        const p = r.profiles as unknown as { full_name: string } | null;
        const name = p?.full_name || "?";
        const entry =
          perPlayer.get(r.profile_id as string) ?? {
            name,
            zusagen: 0,
            absagen: 0,
            vielleicht: 0,
          };
        if (r.status === "yes") {
          counts.zusagen++;
          entry.zusagen++;
        } else if (r.status === "no") {
          counts.absagen++;
          entry.absagen++;
        } else {
          counts.vielleicht++;
          entry.vielleicht++;
        }
        perPlayer.set(r.profile_id as string, entry);
      }
    }

    await supabase.from("season_team_archive").insert({
      season_id: id,
      team_name: team.name,
      league: team.league ?? "",
      roster,
      stats: {
        termine: eventIds.length,
        ...counts,
        spieler: Array.from(perPlayer.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      },
    });
  }

  // Pokal-Kader ebenfalls ins Archiv übernehmen
  const { data: squadRows } = await supabase
    .from("pokal_squads")
    .select("kind, profiles(full_name), member_invites(full_name)")
    .eq("season_id", id);
  const pokalNames: Record<string, string> = {
    ku: "Klaus Unterberg Pokal (4er)",
    "8er": "8ter Cup (BDV)",
  };
  for (const kind of ["ku", "8er"]) {
    const roster = (squadRows ?? [])
      .filter((r) => r.kind === kind)
      .map((r) => {
        const p = r.profiles as unknown as { full_name: string } | null;
        const i = r.member_invites as unknown as { full_name: string } | null;
        return {
          name: p?.full_name || i?.full_name || "?",
          captain: false,
          vice: false,
        };
      });
    if (roster.length) {
      await supabase.from("season_team_archive").insert({
        season_id: id,
        team_name: pokalNames[kind],
        league: "Pokal",
        roster,
        stats: {},
      });
    }
  }

  await supabase
    .from("seasons")
    .update({ status: "archived", survey_open: false })
    .eq("id", id);

  revalidatePath("/mitglieder/admin/saisons");
  revalidatePath(`/mitglieder/admin/saisons/${id}`);
}
