"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { slugify } from "@/lib/slug";
import {
  formatNuligaSyncMessage,
  syncAllNuligaTeams,
  syncNuligaTeam,
} from "@/lib/nuliga-sync";

function revalidateTeams() {
  revalidatePath("/mitglieder/admin/mannschaften");
  revalidatePath("/mitglieder/mannschaften");
  revalidatePath("/mannschaften");
}

/** Spielmodi speichern: Liga je Mannschaft, Pokal + 8ter Cup vereinsweit. */
export async function saveSpielModi(formData: FormData) {
  await requireEditor();
  const supabase = await createClient();
  const now = new Date().toISOString();

  await supabase.from("app_settings").upsert([
    {
      key: "modus_pokal",
      value: String(formData.get("modus_pokal") ?? "").trim(),
      updated_at: now,
    },
    {
      key: "modus_8er",
      value: String(formData.get("modus_8er") ?? "").trim(),
      updated_at: now,
    },
  ]);

  // Liga-Modus je Mannschaft (Felder team_modus_<id>)
  for (const [feld, wert] of formData.entries()) {
    if (!feld.startsWith("team_modus_")) continue;
    const teamId = feld.slice("team_modus_".length);
    await supabase
      .from("teams")
      .update({ spielmodus: String(wert ?? "").trim() })
      .eq("id", teamId);
  }

  revalidateTeams();
  revalidatePath("/mitglieder/termine");
}

export async function createTeam(formData: FormData) {
  await requireEditor();
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
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const weekdayRaw = Number(formData.get("home_match_weekday") ?? 0);
  const home_match_weekday =
    weekdayRaw >= 1 && weekdayRaw <= 7 ? weekdayRaw : null;

  const defaultRsvpRaw = String(formData.get("default_rsvp") ?? "");
  const default_rsvp = ["yes", "no", "maybe"].includes(defaultRsvpRaw)
    ? defaultRsvpRaw
    : "";

  const sortRaw = Number(formData.get("sort_order") ?? 0);
  const sort_order =
    Number.isFinite(sortRaw) && sortRaw >= 0 && sortRaw <= 99
      ? Math.round(sortRaw)
      : 0;

  const supabase = await createClient();
  await supabase
    .from("teams")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      league: String(formData.get("league") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      nuliga_url: String(formData.get("nuliga_url") ?? "").trim(),
      nuliga_ical_url: String(formData.get("nuliga_ical_url") ?? "").trim(),
      nuliga_table_url: String(formData.get("nuliga_table_url") ?? "").trim(),
      home_match_weekday,
      home_match_time: String(formData.get("home_match_time") ?? "").trim(),
      default_rsvp,
      sort_order,
    })
    .eq("id", id);
  revalidateTeams();
  revalidatePath(`/mitglieder/admin/mannschaften/${id}`);
}

// Kader-Ziel aus dem Formular: "p:<profilId>" = registriertes Mitglied
// (team_members), "i:<inviteId>" = vorab angelegter Name (member_invites).
function leseZiel(formData: FormData) {
  const team_id = String(formData.get("team_id") ?? "");
  const target = String(formData.get("target") ?? "");
  const istInvite = target.startsWith("i:");
  const ref = target.slice(2);
  return { team_id, ref, istInvite, ok: Boolean(team_id && ref) };
}

export async function addRosterMember(formData: FormData) {
  await requireEditor();
  const { team_id, ref, istInvite, ok } = leseZiel(formData);
  if (!ok) return;

  if (istInvite) {
    // Name (Invite) diesem Team zuordnen: team_ids-Array ergänzen.
    // member_invites: RLS nur für Admins → Service-Client.
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("member_invites")
      .select("team_ids")
      .eq("id", ref)
      .maybeSingle();
    const teams = ((data?.team_ids as string[] | null) ?? []);
    if (!teams.includes(team_id)) {
      await admin
        .from("member_invites")
        .update({ team_ids: [...teams, team_id] })
        .eq("id", ref);
    }
  } else {
    const supabase = await createClient();
    await supabase
      .from("team_members")
      .upsert({ team_id, profile_id: ref }, { onConflict: "team_id,profile_id" });
  }
  revalidatePath(`/mitglieder/admin/mannschaften/${team_id}`);
}

export async function removeRosterMember(formData: FormData) {
  await requireEditor();
  const { team_id, ref, istInvite, ok } = leseZiel(formData);
  if (!ok) return;

  if (istInvite) {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("member_invites")
      .select("team_ids, captain_of, vice_of")
      .eq("id", ref)
      .maybeSingle();
    const teams = ((data?.team_ids as string[] | null) ?? []).filter(
      (t) => t !== team_id,
    );
    await admin
      .from("member_invites")
      .update({
        team_ids: teams,
        // Rolle beim Entfernen aus dem Team mit lösen
        captain_of: data?.captain_of === team_id ? null : data?.captain_of,
        vice_of: data?.vice_of === team_id ? null : data?.vice_of,
      })
      .eq("id", ref);
  } else {
    const supabase = await createClient();
    await supabase
      .from("team_members")
      .delete()
      .eq("team_id", team_id)
      .eq("profile_id", ref);
  }
  revalidatePath(`/mitglieder/admin/mannschaften/${team_id}`);
}

/**
 * Setzt die Team-Rolle: 'captain', 'vice' oder 'none' – für registrierte
 * Mitglieder (team_members) UND vorab angelegte Namen (member_invites).
 * Regel: pro Team genau EIN Kapitän / EIN Vize, quer über beide Quellen.
 */
export async function setTeamRole(formData: FormData) {
  await requireEditor();
  const { team_id, ref, istInvite, ok } = leseZiel(formData);
  const role = String(formData.get("team_role") ?? "none");
  if (!ok) return;

  const supabase = await createClient(); // team_members (RLS: Bearbeiter ok)
  const admin = createAdminSupabase(); // member_invites (RLS: nur Admin)

  if (role === "captain") {
    // Bisherigen Kapitän dieses Teams in BEIDEN Quellen lösen
    await supabase
      .from("team_members")
      .update({ is_captain: false })
      .eq("team_id", team_id);
    await admin
      .from("member_invites")
      .update({ captain_of: null })
      .eq("captain_of", team_id);
    if (istInvite) {
      await admin
        .from("member_invites")
        .update({ captain_of: team_id })
        .eq("id", ref);
      // nicht gleichzeitig Vize desselben Teams
      await admin
        .from("member_invites")
        .update({ vice_of: null })
        .eq("id", ref)
        .eq("vice_of", team_id);
    } else {
      // Person kann nur bei EINEM Team Kapitän sein
      await supabase
        .from("team_members")
        .update({ is_captain: false })
        .eq("profile_id", ref);
      await supabase
        .from("team_members")
        .update({ is_captain: true, is_vice_captain: false })
        .eq("team_id", team_id)
        .eq("profile_id", ref);
    }
  } else if (role === "vice") {
    await supabase
      .from("team_members")
      .update({ is_vice_captain: false })
      .eq("team_id", team_id);
    await admin
      .from("member_invites")
      .update({ vice_of: null })
      .eq("vice_of", team_id);
    if (istInvite) {
      await admin
        .from("member_invites")
        .update({ vice_of: team_id })
        .eq("id", ref);
      await admin
        .from("member_invites")
        .update({ captain_of: null })
        .eq("id", ref)
        .eq("captain_of", team_id);
    } else {
      await supabase
        .from("team_members")
        .update({ is_vice_captain: false })
        .eq("profile_id", ref);
      await supabase
        .from("team_members")
        .update({ is_vice_captain: true, is_captain: false })
        .eq("team_id", team_id)
        .eq("profile_id", ref);
    }
  } else {
    // 'none': Rolle im aktuellen Team lösen
    if (istInvite) {
      await admin
        .from("member_invites")
        .update({ captain_of: null })
        .eq("id", ref)
        .eq("captain_of", team_id);
      await admin
        .from("member_invites")
        .update({ vice_of: null })
        .eq("id", ref)
        .eq("vice_of", team_id);
    } else {
      await supabase
        .from("team_members")
        .update({ is_captain: false, is_vice_captain: false })
        .eq("team_id", team_id)
        .eq("profile_id", ref);
    }
  }

  revalidatePath(`/mitglieder/admin/mannschaften/${team_id}`);
}

export type ImportResult = { ok: boolean; message: string };

export type AllNuligaImportResult = ImportResult & {
  teams: { teamId: string; teamName: string; ok: boolean; message: string }[];
};

/** Derselbe Abgleich wie im täglichen Lauf, manuell für alle konfigurierten Teams. */
export async function syncAllNuligaManual(): Promise<AllNuligaImportResult> {
  await requireEditor();
  try {
    const result = await syncAllNuligaTeams();
    if (result.teams === 0) {
      return { ok: false, message: "Bei keiner Mannschaft ist eine nuLiga-iCal-Adresse hinterlegt.", teams: [] };
    }
    revalidatePath("/mitglieder/admin/mannschaften");
    return {
      ok: result.ok,
      message: `${result.teams} Mannschaften abgeglichen: ${result.erfolgreich} erfolgreich, ${result.fehlgeschlagen} mit Fehlern. Termine: ${result.neu} neu, ${result.aktualisiert} aktualisiert. Ergebnisse: ${result.ergebnisseNeu} neu, ${result.ergebnisseAktualisiert} korrigiert. Liga-Statistik: ${result.berichteNeu} Spielberichte neu, ${result.berichteAktualisiert} aktualisiert.`,
      teams: result.ergebnisse.map((team) => ({
        teamId: team.teamId,
        teamName: team.teamName,
        ok: team.ok,
        message: formatNuligaSyncMessage(team),
      })),
    };
  } catch {
    return {
      ok: false,
      message: "Der gemeinsame nuLiga-Abgleich konnte nicht abgeschlossen werden. Bitte erneut versuchen; gespeicherte Änderungen bleiben erhalten.",
      teams: [],
    };
  }
}

/** Liest den nuLiga-iCal-Feed einer Mannschaft und legt/aktualisiert die Termine. */
export async function importNuligaIcal(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireEditor();
  const team_id = String(formData.get("team_id") ?? "");
  const url = String(formData.get("ical_url") ?? "").trim();
  // Alternativ: heruntergeladene .ics-Datei hochladen
  const datei = formData.get("ical_file");
  const hatDatei = datei instanceof File && datei.size > 0;
  if (!team_id || (!url && !hatDatei)) {
    return {
      ok: false,
      message: "Bitte eine iCal-Adresse eintragen oder eine .ics-Datei wählen.",
    };
  }

  let text: string | undefined;
  if (hatDatei) {
    try {
      text = await (datei as File).text();
    } catch {
      return { ok: false, message: "Die Datei konnte nicht gelesen werden." };
    }
  }
  const result = await syncNuligaTeam({
    teamId: team_id,
    icalUrl: url || undefined,
    icalText: text,
  });
  return { ok: result.ok, message: formatNuligaSyncMessage(result) };
}
