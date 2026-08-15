"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { benachrichtige } from "@/lib/benachrichtigung";
import { formatDate, formatTime } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { parseIcal } from "@/lib/ical";
import {
  normalizeOpponentName,
  parseNuligaMatch,
  resolveNuligaOpponentTeams,
  type NuligaMatchInfo,
} from "@/lib/nuliga-opponents";

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

type ImportedOpponent = {
  id: string;
  name: string;
  address: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
};

type ImportedOpponentLink = {
  opponent_id: string | null;
  opponent_team_no: number | null;
  home_away: "heim" | "auswaerts";
};

async function syncImportedOpponents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  parsedMatches: (NuligaMatchInfo | null)[],
): Promise<{
  links: (ImportedOpponentLink | null)[];
  opponentsFound: number;
  opponentsCreated: number;
  addressesAdded: number;
  unrecognized: number;
  hadErrors: boolean;
}> {
  const { data, error: loadError } = await supabase
    .from("opponents")
    .select("id,name,address,street,zip,city")
    .order("created_at", { ascending: true });

  const matches = resolveNuligaOpponentTeams(parsedMatches);
  const links: (ImportedOpponentLink | null)[] = matches.map((match) =>
    match
      ? {
          opponent_id: null,
          opponent_team_no: null,
          home_away: match.homeAway,
        }
      : null,
  );
  let unrecognized = matches.filter((match) => !match).length;

  if (loadError) {
    return {
      links,
      opponentsFound: 0,
      opponentsCreated: 0,
      addressesAdded: 0,
      unrecognized,
      hadErrors: true,
    };
  }

  const opponentsByName = new Map<string, ImportedOpponent>();
  const duplicateKeys = new Set<string>();
  for (const row of (data ?? []) as ImportedOpponent[]) {
    const key = normalizeOpponentName(row.name);
    if (!key) continue;
    if (opponentsByName.has(key)) duplicateKeys.add(key);
    else opponentsByName.set(key, row);
  }

  let opponentsCreated = 0;
  let addressesAdded = 0;
  let hadErrors = false;

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    if (!match) continue;
    const key = normalizeOpponentName(match.opponentName);
    if (!key || duplicateKeys.has(key)) {
      unrecognized++;
      hadErrors = true;
      continue;
    }
    let opponent = opponentsByName.get(key);
    let linkedTeamNo = match.opponentTeamNo;
    if (!opponent && match.opponentTeamNo > 1) {
      const legacyKey = normalizeOpponentName(match.rawOpponentName);
      if (duplicateKeys.has(legacyKey)) {
        unrecognized++;
        hadErrors = true;
        continue;
      }
      // Ältere Einträge wurden teils samt Mannschaftssuffix angelegt.
      // Diese weiterverwenden; die Nummer steckt dann bereits im Namen.
      opponent = opponentsByName.get(legacyKey);
      if (opponent) linkedTeamNo = 1;
    }

    if (!opponent) {
      const address = match.opponentAddress;
      const { data: created, error } = await supabase
        .from("opponents")
        .insert({
          name: match.opponentName,
          address: address?.address ?? "",
          street: address?.street ?? "",
          zip: address?.zip ?? "",
          city: address?.city ?? "",
          notes: "",
        })
        .select("id,name,address,street,zip,city")
        .single();
      if (error || !created) {
        hadErrors = true;
        continue;
      }
      opponent = created as ImportedOpponent;
      opponentsByName.set(key, opponent);
      opponentsCreated++;
      if (address) addressesAdded++;
    } else if (match.opponentAddress) {
      const street = opponent.street?.trim() || match.opponentAddress.street;
      const zip = opponent.zip?.trim() || match.opponentAddress.zip;
      const city = opponent.city?.trim() || match.opponentAddress.city;
      const address =
        opponent.address?.trim() ||
        [street, [zip, city].filter(Boolean).join(" ")]
          .filter(Boolean)
          .join(", ");
      const addressUpdate: Partial<
        Pick<ImportedOpponent, "address" | "street" | "zip" | "city">
      > = {};
      if (!opponent.street?.trim()) addressUpdate.street = street;
      if (!opponent.zip?.trim()) addressUpdate.zip = zip;
      if (!opponent.city?.trim()) addressUpdate.city = city;
      if (!opponent.address?.trim()) addressUpdate.address = address;

      if (Object.keys(addressUpdate).length > 0) {
        const { data: updated, error } = await supabase
          .from("opponents")
          .update(addressUpdate)
          .eq("id", opponent.id)
          .select("id,name,address,street,zip,city")
          .single();
        if (error || !updated) {
          hadErrors = true;
        } else {
          opponent = updated as ImportedOpponent;
          opponentsByName.set(key, opponent);
          addressesAdded++;
        }
      }
    }

    links[index] = {
      opponent_id: opponent.id,
      opponent_team_no: linkedTeamNo,
      home_away: match.homeAway,
    };
  }

  const opponentsFound = new Set(
    links.map((link) => link?.opponent_id).filter(Boolean),
  ).size;
  return {
    links,
    opponentsFound,
    opponentsCreated,
    addressesAdded,
    unrecognized,
    hadErrors,
  };
}

/** Liest den nuLiga-iCal-Feed einer Mannschaft und legt/aktualisiert die Termine. */
export async function importNuligaIcal(
  _prev: ImportResult | null,
  formData: FormData,
): Promise<ImportResult> {
  await requireEditor();
  const team_id = String(formData.get("team_id") ?? "");
  // nuLiga liefert die Adresse als webcal://… („Zu Kalender hinzufügen“) –
  // das ist dieselbe Adresse über https, also einfach umschreiben.
  const url = String(formData.get("ical_url") ?? "")
    .trim()
    .replace(/^webcal:\/\//i, "https://");
  // Alternativ: heruntergeladene .ics-Datei hochladen
  const datei = formData.get("ical_file");
  const hatDatei = datei instanceof File && datei.size > 0;
  if (!team_id || (!url && !hatDatei)) {
    return {
      ok: false,
      message: "Bitte eine iCal-Adresse eintragen oder eine .ics-Datei wählen.",
    };
  }

  let text: string;
  if (hatDatei) {
    try {
      text = await (datei as File).text();
    } catch {
      return { ok: false, message: "Die Datei konnte nicht gelesen werden." };
    }
  } else {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        return { ok: false, message: `nuLiga antwortete mit Status ${res.status}.` };
      }
      text = await res.text();
    } catch {
      return { ok: false, message: "iCal-Feed konnte nicht geladen werden." };
    }
  }

  const events = parseIcal(text);
  if (events.length === 0) {
    return { ok: false, message: "Keine Termine im Feed gefunden." };
  }

  const supabase = await createClient();
  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("name,league,slug")
    .eq("id", team_id)
    .maybeSingle();
  if (teamError || !team) {
    return { ok: false, message: "Mannschaft wurde nicht gefunden." };
  }

  const parsedMatches = events.map((event) =>
    parseNuligaMatch(event, team.name as string, (team.league as string) || ""),
  );
  const opponentSync = await syncImportedOpponents(supabase, parsedMatches);
  const rows = events.map((e, index) => {
    const link = opponentSync.links[index];
    return {
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
      opponent_id: link?.opponent_id ?? null,
      opponent_team_no: link?.opponent_team_no ?? null,
      home_away: link?.home_away ?? "",
    };
  });

  // Abgleich von Hand (kein Upsert – der eindeutige source_uid-Index ist
  // ein Teil-Index, mit dem die Upsert-Automatik nicht umgehen kann):
  // bekannte Spieltage aktualisieren, neue anlegen.
  const { data: vorhandene } = await supabase
    .from("events")
    .select(
      "id, source_uid, starts_at, opponent_id, opponent_team_no, home_away",
    )
    .in("source_uid", rows.map((r) => r.source_uid));
  const bekannt = new Map(
    (vorhandene ?? []).map((v) => [
      v.source_uid as string,
      {
        id: v.id as string,
        starts_at: v.starts_at as string,
        opponent_id: (v.opponent_id as string | null) ?? null,
        opponent_team_no: (v.opponent_team_no as number | null) ?? null,
        home_away: (v.home_away as string | null) ?? "",
      },
    ]),
  );

  let neu = 0;
  let aktualisiert = 0;
  let letzterFehler = "";
  // Verlegte Spiele (zukünftige Termine mit geänderter Anstoßzeit) merken,
  // um den Kader danach zu benachrichtigen.
  const verlegt: { id: string; title: string; alt: string; neu: string }[] = [];
  for (const row of rows) {
    const bestehend = bekannt.get(row.source_uid);
    if (bestehend) {
      const opponentUpdate: Record<string, string | number> = {};
      const sameOrEmptyOpponent =
        !bestehend.opponent_id || bestehend.opponent_id === row.opponent_id;
      if (!bestehend.opponent_id && row.opponent_id) {
        opponentUpdate.opponent_id = row.opponent_id;
      }
      if (
        sameOrEmptyOpponent &&
        bestehend.opponent_team_no == null &&
        row.opponent_team_no != null
      ) {
        opponentUpdate.opponent_team_no = row.opponent_team_no;
      }
      if (!bestehend.home_away && row.home_away) {
        opponentUpdate.home_away = row.home_away;
      }
      const { error } = await supabase
        .from("events")
        .update({
          title: row.title,
          description: row.description,
          location: row.location,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
          ...opponentUpdate,
        })
        .eq("id", bestehend.id);
      if (error) letzterFehler = error.message;
      else {
        aktualisiert++;
        const altZeit = new Date(bestehend.starts_at).getTime();
        const neuZeit = new Date(row.starts_at).getTime();
        if (
          Number.isFinite(altZeit) &&
          Number.isFinite(neuZeit) &&
          altZeit !== neuZeit &&
          neuZeit > Date.now()
        ) {
          verlegt.push({
            id: bestehend.id,
            title: row.title,
            alt: bestehend.starts_at,
            neu: row.starts_at,
          });
        }
      }
    } else {
      const { error } = await supabase.from("events").insert(row);
      if (error) letzterFehler = error.message;
      else neu++;
    }
  }

  // Push/E-Mail an den Kader, wenn ein zukünftiges Spiel verlegt wurde
  if (verlegt.length > 0) {
    try {
      const admin = createAdminSupabase();
      const { data: kader } = await admin
        .from("team_members")
        .select("profile_id")
        .eq("team_id", team_id);
      const ids = (kader ?? [])
        .map((m) => m.profile_id as string)
        .filter(Boolean);
      for (const v of verlegt) {
        const zeit = (iso: string) =>
          formatTime(iso) === "00:00"
            ? formatDate(iso)
            : `${formatDate(iso)}, ${formatTime(iso)} Uhr`;
        await benachrichtige(ids, {
          title: `⚠️ Spiel verlegt: ${v.title}`,
          body: `Neu: ${zeit(v.neu)} (bisher ${zeit(v.alt)}). Bitte Zu-/Absage prüfen.`,
          url: `/mitglieder/termine/${v.id}`,
        });
      }
    } catch {
      // Versand ist best-effort
    }
  }

  if (neu + aktualisiert === 0) {
    return {
      ok: false,
      message: `Fehler beim Speichern: ${letzterFehler || "unbekannt"}`,
    };
  }

  revalidatePath("/mitglieder/termine");
  revalidatePath("/termine");
  revalidatePath("/mitglieder/admin/termine");
  revalidatePath("/mitglieder/admin/gegner");
  revalidatePath(`/mitglieder/admin/mannschaften/${team_id}`);
  revalidatePath(`/mitglieder/mannschaften/${team.slug as string}`);
  const opponentMessage =
    ` Gegner: ${opponentSync.opponentsFound} erkannt, ` +
    `${opponentSync.opponentsCreated} neu angelegt, ` +
    `${opponentSync.addressesAdded} Adressen ergänzt.` +
    (opponentSync.unrecognized > 0
      ? ` ${opponentSync.unrecognized} Begegnung${
          opponentSync.unrecognized === 1 ? "" : "en"
        } konnte${opponentSync.unrecognized === 1 ? "" : "n"} nicht eindeutig zugeordnet werden.`
      : "") +
    (opponentSync.hadErrors
      ? " Gegnerdaten konnten teilweise nicht gespeichert werden."
      : "");
  return {
    ok: true,
    message:
      `${neu} Termine neu angelegt, ${aktualisiert} aktualisiert.` +
      opponentMessage +
      (verlegt.length > 0
        ? ` ${verlegt.length} Verlegung${verlegt.length === 1 ? "" : "en"} erkannt – Kader wurde benachrichtigt.`
        : "") +
      (letzterFehler ? ` (Teilweise Fehler: ${letzterFehler})` : ""),
  };
}
