"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseSurveyAnswers } from "@/lib/season";
import { berlinLocalToISO } from "@/lib/tz";
import {
  parseSpielbericht,
  parseDreiKSpiele,
  parseDreiKBestleistungen,
  parseDreiKStatistiken,
  alsMatchStats,
  spielerBilanz,
  type MatchStats,
} from "@/lib/spielbericht";
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

/**
 * Termin-/Zusagen-Statistik einer Mannschaft im Zeitraum berechnen
 * (ohne Zeitraum: alle vorhandenen Termine des Teams).
 */
async function teamStatistik(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  startsOn: string | null,
  endsOn: string | null,
) {
  let evQuery = supabase.from("events").select("id").eq("team_id", teamId);
  if (startsOn) evQuery = evQuery.gte("starts_at", startsOn);
  if (endsOn) evQuery = evQuery.lte("starts_at", `${endsOn}T23:59:59Z`);
  const { data: events } = await evQuery;
  const eventIds = ((events as Pick<EventRow, "id">[]) ?? []).map((e) => e.id);

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

  return {
    termine: eventIds.length,
    ...counts,
    spieler: Array.from(perPlayer.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
  };
}

/**
 * Archiv-Schnappschuss der AKTUELLEN Mannschaften für eine Saison anlegen:
 * Kader (inkl. Kapitän/Vize) und Termin-/Zusagen-Statistik im angegebenen
 * Zeitraum (ohne Zeitraum: alle vorhandenen Termine des Teams).
 */
async function schnappschussTeams(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
  startsOn: string | null,
  endsOn: string | null,
) {
  const { data: teamsData } = await supabase.from("teams").select("*");
  const teams = teamsData ?? [];

  // Vorab angelegte Namen (noch nicht registriert) gehören mit in den
  // Kader – ihre Zuordnung steckt in member_invites.team_ids.
  const { data: invData } = await supabase
    .from("member_invites")
    .select("full_name, team_ids, captain_of, vice_of")
    .eq("claimed", false);
  const invites = invData ?? [];

  for (const team of teams) {
    // Kader: registrierte Mitglieder …
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
    // … plus vorab angelegte Namen dieses Teams
    for (const inv of invites) {
      if (!((inv.team_ids as string[]) ?? []).includes(team.id)) continue;
      roster.push({
        name: (inv.full_name as string) || "?",
        captain: inv.captain_of === team.id,
        vice: inv.vice_of === team.id,
      });
    }
    roster.sort(
      (a, b) =>
        Number(b.captain) - Number(a.captain) ||
        Number(b.vice) - Number(a.vice) ||
        a.name.localeCompare(b.name),
    );

    const stats = await teamStatistik(supabase, team.id, startsOn, endsOn);

    await supabase.from("season_team_archive").insert({
      season_id: id,
      team_name: team.name,
      league: team.league ?? "",
      roster,
      stats,
    });
  }
}

/**
 * Statistik einer archivierten Saison neu berechnen – z. B. nachdem die
 * alten Spieltage per nuLiga-Import nachgetragen wurden. Zugeordnet wird
 * über den Team-Namen; von Hand gepflegte Kader und der nuLiga-Link
 * bleiben erhalten.
 */
export async function refreshArchivStatistik(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("season_id") ?? "");
  if (!seasonId) return;

  const supabase = await createClient();
  const { data: season } = await supabase
    .from("seasons")
    .select("starts_on, ends_on")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season) return;

  const [{ data: teamsData }, { data: eintraege }] = await Promise.all([
    supabase.from("teams").select("id, name"),
    supabase
      .from("season_team_archive")
      .select("id, team_name, stats")
      .eq("season_id", seasonId),
  ]);

  for (const eintrag of eintraege ?? []) {
    const team = (teamsData ?? []).find(
      (t) => t.name === eintrag.team_name,
    );
    if (!team) continue; // z. B. Pokal-Einträge oder umbenannte Teams
    const stats = await teamStatistik(
      supabase,
      team.id as string,
      (season.starts_on as string | null) ?? null,
      (season.ends_on as string | null) ?? null,
    );
    await supabase
      .from("season_team_archive")
      .update({
        stats: {
          ...((eintrag.stats as Record<string, unknown>) ?? {}),
          ...stats,
        },
      })
      .eq("id", eintrag.id);
  }

  revalidatePath(`/mitglieder/admin/saisons/${seasonId}`);
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

  await schnappschussTeams(
    supabase,
    id,
    (season.starts_on as string | null) ?? null,
    (season.ends_on as string | null) ?? null,
  );

  // Pokal-Kader ebenfalls ins Archiv übernehmen (je Team ein Eintrag)
  const { data: squadRows } = await supabase
    .from("pokal_squads")
    .select(
      "kind, team_no, is_captain, profiles(full_name), member_invites(full_name)",
    )
    .eq("season_id", id);
  const pokalNames: Record<string, string> = {
    ku: "Klaus Unterberg Pokal (4er)",
    "8er": "8ter Cup (BDV)",
  };
  for (const kind of ["ku", "8er"]) {
    const kindRows = (squadRows ?? []).filter((r) => r.kind === kind);
    const teamNos = [...new Set(kindRows.map((r) => r.team_no as number))].sort(
      (a, b) => a - b,
    );
    for (const no of teamNos) {
      const roster = kindRows
        .filter((r) => r.team_no === no)
        .map((r) => {
          const p = r.profiles as unknown as { full_name: string } | null;
          const i = r.member_invites as unknown as { full_name: string } | null;
          return {
            name: p?.full_name || i?.full_name || "?",
            captain: (r.is_captain as boolean | null) ?? false,
            vice: false,
          };
        });
      if (roster.length) {
        await supabase.from("season_team_archive").insert({
          season_id: id,
          team_name:
            teamNos.length > 1
              ? `${pokalNames[kind]} – Team ${no}`
              : pokalNames[kind],
          league: "Pokal",
          roster,
          stats: {},
        });
      }
    }
  }

  await supabase
    .from("seasons")
    .update({ status: "archived", survey_open: false })
    .eq("id", id);

  revalidatePath("/mitglieder/admin/saisons");
  revalidatePath(`/mitglieder/admin/saisons/${id}`);
}

/**
 * Vergangene Saison nachtragen: legt die Saison SOFORT als Archiv an und
 * macht den Schnappschuss der AKTUELLEN Mannschaften (Kader, Kapitäne,
 * Spieltags-Statistik im angegebenen Zeitraum). Aktive Saison, Teams und
 * Planung bleiben komplett unberührt.
 */
export async function nachtrageArchivSaison(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const starts_on = String(formData.get("starts_on") ?? "") || null;
  const ends_on = String(formData.get("ends_on") ?? "") || null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("seasons")
    .insert({ name, starts_on, ends_on, status: "archived", survey_open: false })
    .select("id")
    .single();
  if (error || !data?.id) {
    redirect(
      `/mitglieder/admin/saisons?fehler=${encodeURIComponent(
        error?.message ?? "Saison konnte nicht angelegt werden.",
      )}`,
    );
  }

  await schnappschussTeams(supabase, data.id as string, starts_on, ends_on);

  revalidatePath("/mitglieder/admin/saisons");
  redirect(`/mitglieder/admin/saisons/${data.id}`);
}

/** Saison komplett löschen (inkl. Archiv, Antworten, Pokal, Entwürfen). */
export async function deleteSeason(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("seasons").delete().eq("id", id);
  if (error) {
    redirect(
      `/mitglieder/admin/saisons?fehler=${encodeURIComponent(error.message)}`,
    );
  }
  revalidatePath("/mitglieder/admin/saisons");
  redirect("/mitglieder/admin/saisons");
}

/**
 * Archiv-Eintrag bearbeiten: Name, Liga, Kader (eine Person je Zeile,
 * optional „C“/„VC“ am Zeilenende) und die Statistik-Summen.
 */
export async function updateArchivTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const seasonId = String(formData.get("season_id") ?? "");
  const team_name = String(formData.get("team_name") ?? "").trim();
  if (!id || !team_name) return;
  const league = String(formData.get("league") ?? "").trim();

  const roster = String(formData.get("roster") ?? "")
    .split(/\r?\n/)
    .map((z) => z.trim())
    .filter(Boolean)
    .map((zeile) => {
      const m = zeile.match(/^(.*?)[\s,;]+(C|VC)$/i);
      const rolle = m ? m[2].toUpperCase() : "";
      return {
        name: (m ? m[1] : zeile).trim(),
        captain: rolle === "C",
        vice: rolle === "VC",
      };
    });

  const zahl = (feld: string) =>
    Math.max(0, Math.round(Number(formData.get(feld))) || 0);

  const supabase = await createClient();
  const { data: alt } = await supabase
    .from("season_team_archive")
    .select("stats")
    .eq("id", id)
    .maybeSingle();
  const stats = {
    ...((alt?.stats as Record<string, unknown>) ?? {}),
    termine: zahl("termine"),
    zusagen: zahl("zusagen"),
    absagen: zahl("absagen"),
    vielleicht: zahl("vielleicht"),
    nuliga_url: String(formData.get("nuliga_url") ?? "").trim(),
  };

  await supabase
    .from("season_team_archive")
    .update({ team_name, league, roster, stats })
    .eq("id", id);
  revalidatePath(`/mitglieder/admin/saisons/${seasonId}`);
}

/** Leeren Archiv-Eintrag (Team) zu einer archivierten Saison hinzufügen. */
export async function addArchivTeam(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("season_id") ?? "");
  const team_name = String(formData.get("team_name") ?? "").trim();
  if (!seasonId || !team_name) return;
  const league = String(formData.get("league") ?? "").trim();

  const supabase = await createClient();
  await supabase.from("season_team_archive").insert({
    season_id: seasonId,
    team_name,
    league,
    roster: [],
    stats: {},
  });
  revalidatePath(`/mitglieder/admin/saisons/${seasonId}`);
}

/**
 * Spieltag einer (Archiv-)Saison bearbeiten: Titel, Datum/Uhrzeit und
 * Endergebnis (z. B. "8:10").
 */
export async function updateArchivSpieltag(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const seasonId = String(formData.get("season_id") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const datum = String(formData.get("datum") ?? "");
  if (!id || !title || !/^\d{4}-\d{2}-\d{2}$/.test(datum)) return;
  const zeit = String(formData.get("zeit") ?? "").trim();
  const starts_at =
    berlinLocalToISO(`${datum}T${/^\d{2}:\d{2}$/.test(zeit) ? zeit : "00:00"}`) ??
    `${datum}T00:00:00Z`;

  const supabase = await createClient();
  await supabase
    .from("events")
    .update({
      title,
      starts_at,
      time_tbd: !/^\d{2}:\d{2}$/.test(zeit),
      result: String(formData.get("result") ?? "").trim(),
    })
    .eq("id", id);
  revalidatePath(`/mitglieder/admin/saisons/${seasonId}`);
  revalidatePath("/mitglieder/termine");
}

export type BerichtImportResult = { ok: boolean; message: string };

/**
 * Spielberichte für einen Spieltag auswerten. Je nach Erfassungsart:
 * nuLiga-Spielbericht (immer möglich) und/oder die 3K-Ansichten
 * (Spiele, Bestleistungen, Statistiken) – alles per Strg+A/Strg+C von
 * der jeweiligen Seite kopiert. Spieler, Ergebnisse und Averages werden
 * automatisch zugeordnet, das Endergebnis wird gesetzt.
 */
export async function importStatistik(
  _prev: BerichtImportResult | null,
  formData: FormData,
): Promise<BerichtImportResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const seasonId = String(formData.get("season_id") ?? "");
  const quelleRaw = String(formData.get("quelle") ?? "");
  const quelle = (["", "3k", "darthelfer"].includes(quelleRaw)
    ? quelleRaw
    : "") as MatchStats["quelle"];
  const nuligaText = String(formData.get("nuliga") ?? "").trim();
  const k3Spiele = String(formData.get("k3_spiele") ?? "").trim();
  const k3Best = String(formData.get("k3_best") ?? "").trim();
  const k3Stats = String(formData.get("k3_stats") ?? "").trim();

  if (!id) return { ok: false, message: "Spieltag fehlt." };
  if (!nuligaText && !k3Spiele) {
    return { ok: false, message: "Bitte mindestens einen Bericht einfügen." };
  }

  const supabase = await createClient();
  const { data: alt } = await supabase
    .from("events")
    .select("match_stats")
    .eq("id", id)
    .maybeSingle();
  const daten: MatchStats = alsMatchStats(alt?.match_stats) ?? {};
  daten.quelle = quelle;

  const teile: string[] = [];
  if (nuligaText) {
    const res = parseSpielbericht(nuligaText);
    if (!res.ok) return { ok: false, message: `nuLiga: ${res.fehler}` };
    daten.nuliga = res.bericht;
    teile.push(
      `nuLiga: ${res.bericht.spiele.length} Spiele, Endergebnis ${res.bericht.ergebnis}` +
        (res.bericht.uebersprungen
          ? ` (${res.bericht.uebersprungen} Zeilen übersprungen)`
          : ""),
    );
  }
  if (k3Spiele) {
    const res = parseDreiKSpiele(k3Spiele);
    if (!res.ok) return { ok: false, message: `3K: ${res.fehler}` };
    daten.dreik = res.bericht;
    if (k3Best) {
      daten.dreik.bestleistungen = parseDreiKBestleistungen(k3Best);
    }
    if (k3Stats) {
      daten.dreik.statistiken = parseDreiKStatistiken(k3Stats);
    }
    teile.push(
      `3K: ${res.bericht.spiele.length} Spiele, Ø ${res.bericht.gesamtAvg || "?"}` +
        (daten.dreik.bestleistungen
          ? `, ${daten.dreik.bestleistungen.length} Bestleistungen`
          : "") +
        (daten.dreik.statistiken
          ? `, ${daten.dreik.statistiken.length} Match-Averages`
          : ""),
    );
  }

  const bericht = daten.nuliga ?? daten.dreik;
  const patch: Record<string, unknown> = { match_stats: daten };
  if (bericht?.ergebnis) patch.result = bericht.ergebnis;

  const { error } = await supabase.from("events").update(patch).eq("id", id);
  if (error) {
    const hinweis = /column|schema/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    return { ok: false, message: hinweis };
  }

  revalidatePath(`/mitglieder/admin/saisons/${seasonId}`);
  const bilanz = bericht
    ? spielerBilanz(bericht)
        .map((s) => `${s.name.split(",")[0]} ${s.siege}-${s.niederlagen}`)
        .join(" · ")
    : "";
  return {
    ok: true,
    message: `✅ ${teile.join(" · ")}${bilanz ? ` · Bilanz: ${bilanz}` : ""}`,
  };
}

/** Spieltag löschen (z. B. doppelt importiert). */
export async function deleteArchivSpieltag(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const seasonId = String(formData.get("season_id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("events").delete().eq("id", id);
  revalidatePath(`/mitglieder/admin/saisons/${seasonId}`);
  revalidatePath("/mitglieder/termine");
}

/** Einzelnen Archiv-Eintrag löschen. */
export async function deleteArchivTeam(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const seasonId = String(formData.get("season_id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("season_team_archive").delete().eq("id", id);
  revalidatePath(`/mitglieder/admin/saisons/${seasonId}`);
}
