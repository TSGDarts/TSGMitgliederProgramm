"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { benachrichtige } from "@/lib/benachrichtigung";
import { formatDate, formatTime } from "@/lib/format";
import { slugify } from "@/lib/slug";
import { parseIcal } from "@/lib/ical";

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

  const supabase = await createClient();
  await supabase
    .from("teams")
    .update({
      name: String(formData.get("name") ?? "").trim(),
      league: String(formData.get("league") ?? "").trim(),
      description: String(formData.get("description") ?? "").trim(),
      nuliga_url: String(formData.get("nuliga_url") ?? "").trim(),
      nuliga_ical_url: String(formData.get("nuliga_ical_url") ?? "").trim(),
      home_match_weekday,
      home_match_time: String(formData.get("home_match_time") ?? "").trim(),
      default_rsvp,
    })
    .eq("id", id);
  revalidateTeams();
  revalidatePath(`/mitglieder/admin/mannschaften/${id}`);
}

export async function addRosterMember(formData: FormData) {
  await requireEditor();
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
  await requireEditor();
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
  await requireEditor();
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

  // Abgleich von Hand (kein Upsert – der eindeutige source_uid-Index ist
  // ein Teil-Index, mit dem die Upsert-Automatik nicht umgehen kann):
  // bekannte Spieltage aktualisieren, neue anlegen.
  const { data: vorhandene } = await supabase
    .from("events")
    .select("id, source_uid, starts_at")
    .in("source_uid", rows.map((r) => r.source_uid));
  const bekannt = new Map(
    (vorhandene ?? []).map((v) => [
      v.source_uid as string,
      { id: v.id as string, starts_at: v.starts_at as string },
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
      const { error } = await supabase
        .from("events")
        .update({
          title: row.title,
          description: row.description,
          location: row.location,
          starts_at: row.starts_at,
          ends_at: row.ends_at,
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
  return {
    ok: true,
    message:
      `${neu} Termine neu angelegt, ${aktualisiert} aktualisiert.` +
      (verlegt.length > 0
        ? ` ${verlegt.length} Verlegung${verlegt.length === 1 ? "" : "en"} erkannt – Kader wurde benachrichtigt.`
        : "") +
      (letzterFehler ? ` (Teilweise Fehler: ${letzterFehler})` : ""),
  };
}
