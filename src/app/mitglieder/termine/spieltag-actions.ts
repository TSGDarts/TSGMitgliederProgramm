"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { benachrichtige } from "@/lib/benachrichtigung";
import { formatDate, formatTime, ergebnisTone } from "@/lib/format";
import {
  parseSpielbericht,
  alsMatchStats,
  spielerBilanz,
  normalisiereName,
  type MatchStats,
} from "@/lib/spielbericht";
import { vereinsAggregat } from "@/lib/statistik";
import { berechneErfolge } from "@/lib/erfolge";
import {
  getManageableTeamIds,
  getTeamRoster,
} from "@/lib/member-queries";
import { listTeamInvites } from "@/lib/invites";
import { getSpielModi } from "@/lib/settings";
import {
  lineupModeKeyForEvent,
  lineupModeOptionsForEvent,
  lineupSlotsFromMode,
  type LineupModeKey,
} from "@/lib/lineup";

// Fahrgemeinschaft: jeder pflegt seinen eigenen Eintrag pro Termin.
// `ort` = von wo (Startort des Fahrers / Abholort des Mitfahrers),
// `ziel` = Zielort (leer = Spielort), `abfahrt` = freier Zeit-/Abfahrts-Hinweis.
export async function setCarpool(
  eventId: string,
  role: "fahrer" | "mitfahrer" | null,
  opts?: {
    seats?: number;
    ort?: string;
    ziel?: string;
    abfahrt?: string;
    fahrerId?: string | null; // nur Mitfahrer: bei welchem Fahrer
  },
): Promise<{ ok: boolean; message?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!role) {
    await supabase
      .from("event_carpool")
      .delete()
      .eq("event_id", eventId)
      .eq("profile_id", profile.id);
  } else {
    const { error } = await supabase.from("event_carpool").upsert({
      event_id: eventId,
      profile_id: profile.id,
      role,
      seats:
        role === "fahrer"
          ? Math.max(1, Math.min(8, Math.round(opts?.seats ?? 3)))
          : null,
      ort: (opts?.ort ?? "").trim().slice(0, 80),
      ziel: (opts?.ziel ?? "").trim().slice(0, 80),
      abfahrt: (opts?.abfahrt ?? "").trim().slice(0, 80),
      // Zuordnung zum Fahrer nur für Mitfahrer
      fahrer_id: role === "mitfahrer" ? (opts?.fahrerId || null) : null,
      updated_at: new Date().toISOString(),
    });
    if (error) {
      return {
        ok: false,
        message: /column|schema|does not exist/i.test(error.message)
          ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase-SQL-Editor ausführen."
          : error.message,
      };
    }
  }

  revalidatePath(`/mitglieder/termine/${eventId}`);
  return { ok: true };
}

// Helferliste bei Heimspielen: jeder pflegt seinen eigenen Eintrag pro Termin.
export async function setHelfer(
  eventId: string,
  aufgabe: string | null,
): Promise<{ ok: boolean; message?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (aufgabe === null) {
    await supabase
      .from("event_helpers")
      .delete()
      .eq("event_id", eventId)
      .eq("profile_id", profile.id);
  } else {
    const { error } = await supabase.from("event_helpers").upsert({
      event_id: eventId,
      profile_id: profile.id,
      aufgabe: aufgabe.trim().slice(0, 60),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      return {
        ok: false,
        message: /relation|schema/i.test(error.message)
          ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
          : error.message,
      };
    }
  }

  revalidatePath(`/mitglieder/termine/${eventId}`);
  return { ok: true };
}

export type ErgebnisResult = { ok: boolean; message: string };

/**
 * Endergebnis melden (Kapitän/Vize/Bearbeiter/Admin – den Schreibschutz
 * übernimmt die Datenbank-Policy der Termine): Ergebnis von Hand ODER
 * kompletten nuLiga-Spielbericht einfügen (füllt auch die
 * Spielerstatistik). Beim ERSTEN Ergebnis geht eine Benachrichtigung an
 * den ganzen Verein.
 */
export async function meldeErgebnis(
  _prev: ErgebnisResult | null,
  formData: FormData,
): Promise<ErgebnisResult> {
  const profile = await requireProfile();
  const eventId = String(formData.get("event_id") ?? "");
  const resultRaw = String(formData.get("result") ?? "").trim();
  const berichtText = String(formData.get("bericht") ?? "").trim();
  if (!eventId) return { ok: false, message: "Termin fehlt." };
  if (!resultRaw && !berichtText) {
    return {
      ok: false,
      message: "Bitte Ergebnis eintragen oder den nuLiga-Spielbericht einfügen.",
    };
  }

  const supabase = await createClient();
  const { data: alt } = await supabase
    .from("events")
    .select("result, title, match_stats")
    .eq("id", eventId)
    .maybeSingle();
  if (!alt) return { ok: false, message: "Termin nicht gefunden." };

  const patch: Record<string, unknown> = {};
  let result = resultRaw;
  let bilanzText = "";
  if (berichtText) {
    const res = parseSpielbericht(berichtText);
    if (!res.ok) return { ok: false, message: `Spielbericht: ${res.fehler}` };
    const daten: MatchStats = alsMatchStats(alt.match_stats) ?? {};
    daten.nuliga = res.bericht;
    patch.match_stats = daten;
    result = res.bericht.ergebnis;
    bilanzText = spielerBilanz(res.bericht)
      .map((s) => `${s.name.split(",")[0]} ${s.siege}-${s.niederlagen}`)
      .join(" · ");
  }
  patch.result = result;

  const { data: geaendert, error } = await supabase
    .from("events")
    .update(patch)
    .eq("id", eventId)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!geaendert?.length) {
    return {
      ok: false,
      message:
        "Keine Berechtigung – Ergebnisse melden dürfen Kapitän/Vize der Mannschaft, Bearbeiter und Admins.",
    };
  }

  revalidatePath(`/mitglieder/termine/${eventId}`);
  revalidatePath("/mitglieder/ergebnisse");

  // Beim ERSTEN Ergebnis den Verein informieren (einmalig)
  if (!((alt.result as string) ?? "").trim() && result) {
    try {
      const admin = createAdminSupabase();
      const { error: logError } = await admin
        .from("notification_log")
        .insert({ key: `ergebnis:${eventId}` });
      if (!logError) {
        const { data: alle } = await admin
          .from("profiles")
          .select("id")
          .eq("is_active", true)
          .neq("id", profile.id);
        const zeichen =
          ergebnisTone(result) === "ok"
            ? "✅"
            : ergebnisTone(result) === "danger"
              ? "❌"
              : "➖";
        await benachrichtige((alle ?? []).map((p) => p.id as string), {
          title: `${zeichen} Endergebnis: ${result}`,
          body: `${alt.title as string} – Ergebnis wurde eingetragen.`,
          url: `/mitglieder/termine/${eventId}`,
        });
      }
    } catch {
      // best-effort
    }
  }

  // Neue Erfolge/Abzeichen prüfen und den Spielern melden (best-effort).
  // Läuft nur beim Einspielen eines Spielberichts – der Archiv-Nachtrag
  // alter Saisons verschickt bewusst nichts.
  if (berichtText && patch.match_stats) {
    try {
      const bericht = (patch.match_stats as MatchStats).nuliga;
      const beteiligte = new Set<string>();
      for (const s of bericht?.spiele ?? []) {
        for (const n of s.unsere) beteiligte.add(normalisiereName(n));
      }
      if (beteiligte.size > 0) {
        const admin = createAdminSupabase();
        const [{ data: eventData }, { data: spielerProfile }] =
          await Promise.all([
            admin
              .from("events")
              .select("id, title, starts_at, result, match_stats")
              .not("match_stats", "is", null),
            admin
              .from("profiles")
              .select("id, full_name")
              .eq("is_active", true),
          ]);
        const zeilen = vereinsAggregat(
          (eventData ?? []) as Parameters<typeof vereinsAggregat>[0],
        );
        for (const p of spielerProfile ?? []) {
          const key = normalisiereName((p.full_name as string) ?? "");
          if (!key || !beteiligte.has(key)) continue;
          const zeile = zeilen.find(
            (z) => normalisiereName(z.anzeige) === key,
          );
          if (!zeile) continue;
          const neue: string[] = [];
          for (const e of berechneErfolge(zeile)) {
            if (!e.erreicht) continue;
            // insert-first als Einmal-Sperre: klappt der Eintrag, ist das
            // Abzeichen neu – sonst wurde es schon einmal gemeldet.
            const { error: logError } = await admin
              .from("notification_log")
              .insert({ key: `erfolg:${p.id}:${e.id}` });
            if (!logError) neue.push(`${e.emoji} ${e.titel}`);
          }
          if (neue.length > 0) {
            await benachrichtige([p.id as string], {
              title:
                neue.length === 1
                  ? `🏅 Neues Abzeichen: ${neue[0]}`
                  : `🏅 ${neue.length} neue Abzeichen!`,
              body: `${neue.join(" · ")} – stark! Alle Abzeichen findest du in deinem Profil.`,
              url: "/mitglieder/profil",
            });
          }
        }
      }
    } catch {
      // best-effort
    }
  }

  return {
    ok: true,
    message:
      `✅ Ergebnis ${result} gespeichert.` +
      (bilanzText ? ` Bilanz: ${bilanzText}` : ""),
  };
}

/**
 * 2k-Link zum Spiel speichern (Kapitän/Vize/Bearbeiter/Admin – den
 * Schreibschutz übernimmt die Datenbank-Policy der Termine).
 */
export async function saveMatchUrl(
  eventId: string,
  url: string,
): Promise<{ ok: boolean; message?: string }> {
  await requireProfile();
  const sauber = url.trim();
  if (sauber && !/^https?:\/\//i.test(sauber)) {
    return {
      ok: false,
      message: "Bitte einen vollständigen Link angeben (beginnt mit https://…).",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("events")
    .update({ match_url: sauber })
    .eq("id", eventId);
  if (error) {
    const text = /column|schema/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    return { ok: false, message: text };
  }

  revalidatePath(`/mitglieder/termine/${eventId}`);
  return { ok: true };
}

export interface LineupEintrag {
  profile_id: string | null;
  invite_id?: string | null;
  name: string;
  slot_key?: string;
  mode_key?: LineupModeKey;
  mode_snapshot?: string;
  entry_type?: "mode";
}

/**
 * Aufstellung speichern: „entwurf“/„zurueckziehen“ bleiben unsichtbar für
 * die Mannschaft, „freigeben“ macht sie sichtbar. Nur der erste Wechsel
 * von Entwurf zu veröffentlicht benachrichtigt den Kader.
 */
export async function saveLineup(
  eventId: string,
  entries: LineupEintrag[],
  aktion: "entwurf" | "freigeben" | "zurueckziehen",
  selectedModeKey: LineupModeKey | "" = "",
): Promise<{ ok: boolean; message?: string }> {
  const profile = await requireProfile();
  const supabase = await createClient();

  if (!["entwurf", "freigeben", "zurueckziehen"].includes(aktion)) {
    return { ok: false, message: "Ungültige Aktion." };
  }
  if (!Array.isArray(entries) || entries.length > 128) {
    return { ok: false, message: "Die Aufstellung ist ungültig." };
  }
  if (
    selectedModeKey &&
    !["liga", "pokal", "achter"].includes(selectedModeKey)
  ) {
    return { ok: false, message: "Der gewählte Spielmodus ist ungültig." };
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, title, type, team_id, starts_at, time_tbd")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { ok: false, message: "Termin nicht gefunden." };
  if (
    !event.team_id ||
    !["match", "pokal", "friendly"].includes(String(event.type ?? ""))
  ) {
    return { ok: false, message: "Für diesen Termin gibt es keine Aufstellung." };
  }

  const [manageable, bisherRes, teamRes] = await Promise.all([
    getManageableTeamIds(profile),
    supabase
      .from("event_lineups")
      .select("released")
      .eq("event_id", eventId)
      .maybeSingle(),
    supabase
      .from("teams")
      .select("slug, spielmodus")
      .eq("id", event.team_id)
      .maybeSingle(),
  ]);
  if (!manageable.has(event.team_id)) {
    return {
      ok: false,
      message:
        "Keine Berechtigung – nur Kapitän, Vize, Bearbeiter und Admin dürfen die Aufstellung ändern.",
    };
  }

  const notificationKey = `aufstellung:${eventId}:freigabe`;
  const revalidateLineup = () => {
    revalidatePath(`/mitglieder/termine/${eventId}`);
    if (teamRes.data?.slug) {
      revalidatePath(`/mitglieder/mannschaften/${teamRes.data.slug}`);
    }
  };

  // Nur die ausdrückliche Aktion darf eine Veröffentlichung zurückziehen.
  // So kann ein alter Browser-Tab nicht versehentlich einen neueren Stand
  // eines anderen Kapitäns wieder zum Entwurf machen.
  if (aktion === "entwurf" && bisherRes.data?.released) {
    return {
      ok: false,
      message:
        "Die Aufstellung wurde inzwischen veröffentlicht. Bitte Seite neu laden und die veröffentlichte Aufstellung aktualisieren oder ausdrücklich zurückziehen.",
    };
  }

  // Beim Zurückziehen bleibt der gespeicherte Inhalt unverändert. Dadurch
  // funktioniert die Aktion auch, wenn ein Spieler inzwischen den Kader
  // verlassen hat.
  if (aktion === "zurueckziehen") {
    const { data: geaendert, error } = await supabase
      .from("event_lineups")
      .update({ released: false, updated_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .select("event_id");
    if (error || !geaendert?.length) {
      return {
        ok: false,
        message: error?.message ?? "Aufstellung nicht gefunden.",
      };
    }
    try {
      await createAdminSupabase()
        .from("notification_log")
        .delete()
        .eq("key", notificationKey);
    } catch {
      // Die Aufstellung ist trotzdem sicher zurückgezogen.
    }
    revalidateLineup();
    return { ok: true };
  }

  const submittedInviteIds = Array.from(
    new Set(
      entries
        .map((entry) => entry?.invite_id)
        .filter((id): id is string => typeof id === "string" && !!id),
    ),
  );
  const inviteHistoryPromise = submittedInviteIds.length
    ? createAdminSupabase()
        .from("member_invites")
        .select("id, full_name, claimed_profile_id")
        .in("id", submittedInviteIds)
    : Promise.resolve({ data: [] });
  const [roster, invites, modes, inviteHistoryRes] = await Promise.all([
    getTeamRoster(event.team_id),
    listTeamInvites(event.team_id),
    getSpielModi(),
    inviteHistoryPromise,
  ]);
  const modeOptions = lineupModeOptionsForEvent(
    event,
    (teamRes.data?.spielmodus as string | null | undefined) ?? "",
    modes,
  );
  const requestedModeKeys = new Set(
    [selectedModeKey, ...entries.map((entry) => entry?.mode_key)].filter(
      (key): key is LineupModeKey => typeof key === "string" && !!key,
    ),
  );
  if (requestedModeKeys.size > 1) {
    return { ok: false, message: "Die Aufstellung enthält mehrere Spielmodi." };
  }
  const requestedModeKey = Array.from(requestedModeKeys)[0] ?? "";
  if (
    requestedModeKey &&
    !modeOptions.some((option) => option.key === requestedModeKey)
  ) {
    return { ok: false, message: "Der gewählte Spielmodus ist nicht zulässig." };
  }
  const modeKey = lineupModeKeyForEvent(
    event,
    modeOptions,
    requestedModeKey,
  );
  if (event.type === "pokal" && modeOptions.length > 1 && !modeKey) {
    return {
      ok: false,
      message: "Bitte zuerst den Pokal-Wettbewerb und Spielmodus wählen.",
    };
  }
  const mode = modeOptions.find((option) => option.key === modeKey)?.mode ?? "";

  // IDs und Namen nie aus dem Browser übernehmen: nur der aktuelle Kader
  // darf aufgestellt werden, der Anzeigename kommt aus dem Profil/Eintrag.
  const rosterNames = new Map(
    roster.map((m) => [
      m.profile_id,
      m.profile.full_name || m.profile.email || "?",
    ]),
  );
  const inviteNames = new Map(
    invites.map((invite) => [invite.id, invite.full_name]),
  );
  const claimedInviteProfiles = new Map(
    (inviteHistoryRes.data ?? [])
      .filter(
        (invite) =>
          invite.claimed_profile_id &&
          rosterNames.has(invite.claimed_profile_id as string),
      )
      .map((invite) => [
        invite.id as string,
        invite.claimed_profile_id as string,
      ]),
  );
  const sauber: LineupEintrag[] = [];
  for (const raw of entries) {
    let profileId =
      typeof raw?.profile_id === "string" ? raw.profile_id : "";
    let inviteId =
      typeof raw?.invite_id === "string" ? raw.invite_id : "";
    const submittedName = String(raw?.name ?? "").trim();
    if (!profileId && !inviteId && !submittedName) continue;
    if ((!profileId && !inviteId) || (profileId && inviteId)) {
      return {
        ok: false,
        message:
          "Es dürfen nur Spieler aus dem Mannschaftskader aufgestellt werden.",
      };
    }
    if (inviteId && !inviteNames.has(inviteId)) {
      const claimedProfileId = claimedInviteProfiles.get(inviteId);
      if (claimedProfileId) {
        profileId = claimedProfileId;
        inviteId = "";
      }
    }
    const name = profileId ? rosterNames.get(profileId) : inviteNames.get(inviteId);
    if (!name) {
      return {
        ok: false,
        message:
          "Es dürfen nur Spieler aus dem Mannschaftskader aufgestellt werden.",
      };
    }
    sauber.push({
      profile_id: profileId || null,
      ...(inviteId ? { invite_id: inviteId } : {}),
      name: name.slice(0, 80),
      ...(typeof raw.slot_key === "string" && raw.slot_key.trim()
        ? { slot_key: raw.slot_key.trim().slice(0, 80) }
        : {}),
      ...(modeKey ? { mode_key: modeKey } : {}),
    });
  }
  if (sauber.length > 64) {
    return { ok: false, message: "Die Aufstellung enthält zu viele Plätze." };
  }
  if (aktion === "freigeben" && sauber.length === 0) {
    return {
      ok: false,
      message: "Bitte vor dem Veröffentlichen mindestens einen Spieler wählen.",
    };
  }

  // Strukturierte Aufstellungen werden gegen den serverseitig gepflegten
  // Modus geprüft; freie/alte Listen bleiben aus Kompatibilitätsgründen
  // weiterhin zulässig.
  const hasStructuredSlots = sauber.some((entry) => entry.slot_key);
  if (hasStructuredSlots) {
    if (sauber.some((entry) => !entry.slot_key)) {
      return { ok: false, message: "Die Modusplätze sind unvollständig." };
    }
    const allowedSlots = new Map(
      lineupSlotsFromMode(mode).map((slot) => [slot.key, slot]),
    );
    if (allowedSlots.size === 0) {
      return {
        ok: false,
        message:
          "Der Spielmodus kann nicht in Einzel-/Doppelplätze aufgeteilt werden.",
      };
    }
    const usedSlots = new Set<string>();
    const playersByGame = new Map<string, Set<string>>();
    for (const entry of sauber) {
      const slot = allowedSlots.get(entry.slot_key!);
      if (!slot || usedSlots.has(slot.key)) {
        return {
          ok: false,
          message: "Ein Modusplatz ist ungültig oder doppelt.",
        };
      }
      usedSlots.add(slot.key);
      const playerKey = entry.profile_id
        ? `profile:${entry.profile_id}`
        : `invite:${entry.invite_id}`;
      const gamePlayers = playersByGame.get(slot.gameKey) ?? new Set<string>();
      if (gamePlayers.has(playerKey)) {
        return {
          ok: false,
          message: `${slot.gameLabel}: Derselbe Spieler kann nicht beide Plätze belegen.`,
        };
      }
      gamePlayers.add(playerKey);
      playersByGame.set(slot.gameKey, gamePlayers);
    }
  }

  const gespeicherteEintraege: LineupEintrag[] = modeKey
    ? [
        {
          profile_id: null,
          name: "",
          entry_type: "mode",
          mode_key: modeKey,
          mode_snapshot: mode,
        },
        ...sauber,
      ]
    : sauber;

  const payload: Record<string, unknown> = {
    event_id: eventId,
    entries: gespeicherteEintraege,
    released: aktion === "freigeben",
    updated_at: new Date().toISOString(),
  };

  let saveError: { message: string } | null = null;
  if (aktion === "entwurf" && bisherRes.data) {
    const { data: geaendert, error } = await supabase
      .from("event_lineups")
      .update({
        entries: gespeicherteEintraege,
        released: false,
        updated_at: payload.updated_at,
      })
      .eq("event_id", eventId)
      .eq("released", false)
      .select("event_id");
    saveError = error;
    if (!error && !geaendert?.length) {
      return {
        ok: false,
        message:
          "Die Aufstellung wurde gleichzeitig veröffentlicht. Bitte Seite neu laden.",
      };
    }
  } else if (aktion === "entwurf") {
    const { error } = await supabase.from("event_lineups").insert(payload);
    saveError = error;
  } else {
    const { error } = await supabase.from("event_lineups").upsert(payload);
    saveError = error;
  }
  if (saveError) {
    return {
      ok: false,
      message: /relation|schema/i.test(saveError.message)
        ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
        : /duplicate|unique/i.test(saveError.message)
          ? "Die Aufstellung wurde gleichzeitig geändert. Bitte Seite neu laden."
          : "Keine Berechtigung oder Fehler beim Speichern.",
    };
  }

  if (aktion === "freigeben") {
    if (!bisherRes.data?.released) {
      const admin = createAdminSupabase();
      // Der eindeutige Log-Schlüssel ist die atomare Sperre gegen doppelte
      // Nachrichten bei gleichzeitigem Veröffentlichen.
      const { error: lockError } = await admin
        .from("notification_log")
        .insert({ key: notificationKey });
      if (!lockError) {
        try {
          const { data: kader } = await admin
            .from("team_members")
            .select("profile_id")
            .eq("team_id", event.team_id);
          const ids = (kader ?? [])
            .map((m) => m.profile_id as string)
            .filter((id) => id && id !== profile.id);
          const zeit =
            event.time_tbd || formatTime(event.starts_at as string) === "00:00"
              ? "Uhrzeit folgt"
              : `${formatTime(event.starts_at as string)} Uhr`;
          await benachrichtige(ids, {
            title: `📋 Aufstellung: ${event.title}`,
            body: `${formatDate(event.starts_at as string)}, ${zeit} – jetzt ansehen.`,
            url: `/mitglieder/termine/${eventId}`,
          });
        } catch {
          // Bei einem echten Versandfehler darf ein späterer Versuch erneut
          // benachrichtigen.
          await admin
            .from("notification_log")
            .delete()
            .eq("key", notificationKey);
        }
      }
    }
  } else {
    try {
      await createAdminSupabase()
        .from("notification_log")
        .delete()
        .eq("key", notificationKey);
    } catch {
      // Entwurf ist trotzdem gespeichert.
    }
  }

  revalidateLineup();
  return { ok: true };
}
