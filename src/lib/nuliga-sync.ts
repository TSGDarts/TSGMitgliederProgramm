import "server-only";

import { revalidatePath } from "next/cache";
import { benachrichtige } from "@/lib/benachrichtigung";
import { formatDate, formatTime } from "@/lib/format";
import { parseIcal, type IcalEvent } from "@/lib/ical";
import {
  cleanNuligaEventTitle,
  normalizeOpponentName,
  parseNuligaMatch,
} from "@/lib/nuliga-opponents";
import {
  OPPONENT_BACKFILL_SETTING,
  syncImportedOpponents,
} from "@/lib/nuliga-opponent-sync";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { normalizeNuligaIcalUrl } from "@/lib/nuliga-url";
import {
  syncNuligaSpielberichte,
  type NuligaStatistikSyncResult,
} from "@/lib/nuliga-statistik-sync";

type AdminClient = ReturnType<typeof createAdminSupabase>;

interface NuligaTeamConfig {
  id: string;
  name: string;
  league: string | null;
  slug: string;
  nuliga_ical_url: string | null;
  nuliga_table_url: string | null;
  nuliga_url: string | null;
}

interface ExistingEvent {
  id: string;
  source_uid: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  opponent_id: string | null;
  opponent_team_no: number | null;
  home_away: string | null;
}

interface IncomingEventRow {
  team_id: string;
  title: string;
  description: string;
  location: string;
  type: "match";
  starts_at: string;
  ends_at: string | null;
  source: "nuliga";
  source_uid: string;
  is_public: true;
  opponent_id: string | null;
  opponent_team_no: number | null;
  home_away: string;
}

export interface NuligaTeamSyncResult {
  ok: boolean;
  teamId: string;
  teamName: string;
  gefunden: number;
  neu: number;
  aktualisiert: number;
  unveraendert: number;
  verlegt: number;
  verwaist: number;
  gegnerErkannt: number;
  gegnerNeu: number;
  adressenErgaenzt: number;
  nichtZugeordnet: number;
  statistik: NuligaStatistikSyncResult | null;
  fehler: string[];
}

export interface NuligaAllSyncResult {
  ok: boolean;
  teams: number;
  erfolgreich: number;
  fehlgeschlagen: number;
  gefunden: number;
  neu: number;
  aktualisiert: number;
  unveraendert: number;
  verlegt: number;
  verwaist: number;
  berichteGeprueft: number;
  berichteNeu: number;
  berichteAktualisiert: number;
  ergebnisseNeu: number;
  ergebnisseAktualisiert: number;
  ergebnisse: NuligaTeamSyncResult[];
}

const MAX_ICAL_BYTES = 2 * 1024 * 1024;
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function emptyResult(
  teamId: string,
  teamName = "Unbekannte Mannschaft",
): NuligaTeamSyncResult {
  return {
    ok: false,
    teamId,
    teamName,
    gefunden: 0,
    neu: 0,
    aktualisiert: 0,
    unveraendert: 0,
    verlegt: 0,
    verwaist: 0,
    gegnerErkannt: 0,
    gegnerNeu: 0,
    adressenErgaenzt: 0,
    nichtZugeordnet: 0,
    statistik: null,
    fehler: [],
  };
}

function errorResult(
  teamId: string,
  teamName: string,
  message: string,
): NuligaTeamSyncResult {
  const result = emptyResult(teamId, teamName);
  result.fehler.push(message);
  return result;
}

/**
 * Lädt einen nuLiga-Kalender ohne Cache. Redirects werden von Hand verfolgt,
 * damit auch jedes Weiterleitungsziel erneut auf die offizielle Domain geprüft
 * wird und eine gespeicherte URL nicht als SSRF-Sprungbrett dienen kann.
 */
async function loadNuligaIcal(rawUrl: string, deadline: number): Promise<
  | { ok: true; text: string }
  | { ok: false; message: string }
> {
  let current = normalizeNuligaIcalUrl(rawUrl);
  if (!current) {
    return {
      ok: false,
      message:
        "Die iCal-Adresse ist ungültig. Erlaubt sind nur öffentliche nuLiga-Adressen auf liga.nu.",
    };
  }

  for (let redirect = 0; redirect <= 3; redirect++) {
    if (Date.now() >= deadline) {
      return { ok: false, message: "Zeitbudget erreicht; der nächste nuLiga-Abgleich prüft erneut." };
    }
    let response: Response;
    try {
      response = await fetch(current, {
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(Math.max(1, Math.min(20_000, deadline - Date.now()))),
      });
    } catch {
      return { ok: false, message: "Der nuLiga-iCal-Feed war nicht erreichbar." };
    }

    if (REDIRECT_CODES.has(response.status)) {
      if (redirect === 3) {
        return { ok: false, message: "Der nuLiga-iCal-Feed leitet zu oft weiter." };
      }
      const location = response.headers.get("location");
      if (!location) {
        return { ok: false, message: "Ungültige Weiterleitung von nuLiga." };
      }
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, current);
      } catch {
        return { ok: false, message: "Ungültige Weiterleitung von nuLiga." };
      }
      const next = normalizeNuligaIcalUrl(redirectUrl.toString());
      if (!next) {
        return {
          ok: false,
          message: "nuLiga leitete auf eine nicht erlaubte Adresse weiter.",
        };
      }
      current = next;
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        message: `nuLiga antwortete mit Status ${response.status}.`,
      };
    }
    const announcedLength = Number(response.headers.get("content-length") ?? 0);
    if (announcedLength > MAX_ICAL_BYTES) {
      return { ok: false, message: "Der nuLiga-iCal-Feed ist unerwartet groß." };
    }
    let text: string;
    try {
      text = await response.text();
    } catch {
      return {
        ok: false,
        message: "Der nuLiga-iCal-Feed konnte nicht vollständig geladen werden.",
      };
    }
    if (text.length > MAX_ICAL_BYTES) {
      return { ok: false, message: "Der nuLiga-iCal-Feed ist unerwartet groß." };
    }
    return { ok: true, text };
  }

  return { ok: false, message: "Der nuLiga-iCal-Feed konnte nicht geladen werden." };
}

function descriptionField(description: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^\\s*${escaped}:\\s*(.+?)\\s*$`, "im").exec(
    description,
  );
  return match?.[1]?.replace(/\s+/g, " ").trim() ?? "";
}

/** Stabile Begegnungsidentität als Rückfall, falls nuLiga eine UID austauscht. */
function meetingKey(description: string): string | null {
  const number = descriptionField(description, "Begegnungs-Nr");
  const home = descriptionField(description, "Heim");
  const away = descriptionField(description, "Gast");
  const competition =
    description
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(
        (line) =>
          line &&
          !/^(Begegnungs-Nr|Heim|Gast|Halle|Adresse)\s*:/i.test(line),
      ) ?? "";
  if (!/^\d+$/.test(number) || !home || !away || !competition) return null;
  return [
    normalizeOpponentName(competition),
    String(Number(number)),
    normalizeOpponentName(home),
    normalizeOpponentName(away),
  ].join("|");
}

function seasonBounds(categories: string): { start: number; end: number } | null {
  const match = /(?:Saison\s*)?(20\d{2})\/(\d{2}|20\d{2})/i.exec(categories);
  if (!match) return null;
  const startYear = Number(match[1]);
  const rawEnd = Number(match[2]);
  const endYear =
    match[2].length === 2
      ? Math.floor(startYear / 100) * 100 + rawEnd
      : rawEnd;
  if (endYear !== startYear + 1) return null;
  return {
    start: Date.UTC(startYear, 6, 1),
    end: Date.UTC(endYear, 6, 1),
  };
}

function belongsToIncomingSeason(event: IcalEvent, existingStart: string): boolean {
  const bounds = seasonBounds(event.categories);
  const existingTime = Date.parse(existingStart);
  if (!Number.isFinite(existingTime)) return false;
  if (bounds) return existingTime >= bounds.start && existingTime < bounds.end;

  // Alte/abweichende Feeds ohne CATEGORIES: nur nahe Termine desselben
  // zukünftigen Spielplans zusammenführen, niemals quer über Jahre.
  const incomingTime = Date.parse(event.start);
  return (
    Number.isFinite(incomingTime) &&
    Math.abs(existingTime - incomingTime) <= 270 * 864e5
  );
}

function sameInstant(left: string | null, right: string | null): boolean {
  if (!left || !right) return left === right;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? leftTime === rightTime
    : left === right;
}

function eventSignature(event: IcalEvent): string {
  return JSON.stringify([
    event.summary,
    event.description,
    event.location,
    event.categories,
    event.start,
    event.end,
  ]);
}

function uniqueFeedEvents(events: IcalEvent[]):
  | { ok: true; events: IcalEvent[] }
  | { ok: false; message: string } {
  const byUid = new Map<string, IcalEvent>();
  for (const event of events) {
    const known = byUid.get(event.uid);
    if (!known) {
      byUid.set(event.uid, event);
      continue;
    }
    if (eventSignature(known) !== eventSignature(event)) {
      return {
        ok: false,
        message: "Der nuLiga-Feed enthält dieselbe UID mit widersprüchlichen Daten.",
      };
    }
  }
  return { ok: true, events: [...byUid.values()] };
}

function revalidateNuligaViews(team: NuligaTeamConfig) {
  revalidatePath("/mitglieder");
  revalidatePath("/mitglieder/kalender");
  revalidatePath("/mitglieder/termine");
  revalidatePath("/termine");
  revalidatePath("/mitglieder/admin/termine");
  revalidatePath("/mitglieder/admin/gegner");
  revalidatePath(`/mitglieder/admin/mannschaften/${team.id}`);
  revalidatePath(`/mitglieder/mannschaften/${team.slug}`);
  revalidatePath(`/mannschaften/${team.slug}`);
  revalidatePath("/api/kalender");
  revalidatePath("/api/dart-feed");
}

async function notifyMovedMatches(
  admin: AdminClient,
  teamId: string,
  moved: { id: string; title: string; alt: string; neu: string }[],
) {
  if (moved.length === 0) return;
  try {
    const { data: roster } = await admin
      .from("team_members")
      .select("profile_id")
      .eq("team_id", teamId);
    const profileIds = [
      ...new Set(
        (roster ?? [])
          .map((member) => member.profile_id as string)
          .filter(Boolean),
      ),
    ];
    const zeit = (iso: string) =>
      formatTime(iso) === "00:00"
        ? formatDate(iso)
        : `${formatDate(iso)}, ${formatTime(iso)} Uhr`;
    for (const match of moved) {
      await benachrichtige(profileIds, {
        title: `⚠️ Spiel verlegt: ${match.title}`,
        body: `Neu: ${zeit(match.neu)} (bisher ${zeit(match.alt)}). Bitte Zu-/Absage prüfen.`,
        url: `/mitglieder/termine/${match.id}`,
      });
    }
  } catch {
    // Der Abgleich selbst bleibt erfolgreich; Versand ist best-effort.
  }
}

async function syncTeamCalendar(
  admin: AdminClient,
  team: NuligaTeamConfig,
  input: { icalUrl?: string; icalText?: string; notifyMoves?: boolean; deadline?: number },
): Promise<NuligaTeamSyncResult> {
  const deadline = input.deadline ?? Date.now() + 240_000;
  let text = input.icalText;
  const authoritativeFeed = text === undefined;
  if (text === undefined) {
    const loaded = await loadNuligaIcal(input.icalUrl ?? team.nuliga_ical_url ?? "", deadline);
    if (!loaded.ok) return errorResult(team.id, team.name, loaded.message);
    text = loaded.text;
  }

  if (!text.includes("BEGIN:VCALENDAR") || !text.includes("END:VCALENDAR")) {
    return errorResult(
      team.id,
      team.name,
      "Die geladene Datei ist kein vollständiger iCal-Kalender.",
    );
  }
  const parsed = uniqueFeedEvents(parseIcal(text));
  if (!parsed.ok) return errorResult(team.id, team.name, parsed.message);
  if (parsed.events.length === 0) {
    return errorResult(
      team.id,
      team.name,
      "Keine vollständigen Termine mit UID im Feed gefunden.",
    );
  }

  const result = emptyResult(team.id, team.name);
  result.gefunden = parsed.events.length;

  const { data: existingData, error: existingError } = await admin
    .from("events")
    .select(
      "id,source_uid,title,description,location,starts_at,ends_at,opponent_id,opponent_team_no,home_away",
    )
    .eq("team_id", team.id)
    .eq("source", "nuliga")
    .like("source_uid", `nuliga:${team.id}:%`);
  if (existingError) {
    return errorResult(
      team.id,
      team.name,
      "Vorhandene Termine konnten nicht abgeglichen werden.",
    );
  }

  const existing = (existingData ?? []) as ExistingEvent[];
  const bySourceUid = new Map(existing.map((event) => [event.source_uid, event]));
  const now = Date.now();
  const futureByMeetingKey = new Map<string, ExistingEvent[]>();
  for (const event of existing) {
    if (Date.parse(event.starts_at) <= now) continue;
    const key = meetingKey(event.description ?? "");
    if (!key) continue;
    futureByMeetingKey.set(key, [
      ...(futureByMeetingKey.get(key) ?? []),
      event,
    ]);
  }

  const sourceUids = parsed.events.map(
    (event) => `nuliga:${team.id}:${event.uid}`,
  );
  const matchedExisting: (ExistingEvent | undefined)[] = [];
  const usedExistingIds = new Set<string>();
  for (let index = 0; index < parsed.events.length; index++) {
    const event = parsed.events[index];
    let match = bySourceUid.get(sourceUids[index]);
    if (!match && Date.parse(event.start) > now) {
      const key = meetingKey(event.description);
      const candidates = key
        ? (futureByMeetingKey.get(key) ?? []).filter(
            (candidate) =>
              !usedExistingIds.has(candidate.id) &&
              belongsToIncomingSeason(event, candidate.starts_at),
          )
        : [];
      // Nur eine wirklich eindeutige Begegnung darf auf eine neue nuLiga-UID
      // umgeschlüsselt werden. So bleiben Event-ID und alle Kinddaten erhalten.
      if (candidates.length === 1) match = candidates[0];
    }
    matchedExisting.push(match);
    if (match) usedExistingIds.add(match.id);
  }

  const parsedMatches = parsed.events.map((event) =>
    parseNuligaMatch(event, team.name, team.league ?? ""),
  );
  const opponentSync = await syncImportedOpponents(
    admin,
    parsedMatches,
    matchedExisting.map((event) => event?.opponent_id),
  );
  result.gegnerErkannt = opponentSync.opponentsFound;
  result.gegnerNeu = opponentSync.opponentsCreated;
  result.adressenErgaenzt = opponentSync.addressesAdded;
  result.nichtZugeordnet = opponentSync.unrecognized;

  const rows: IncomingEventRow[] = parsed.events.map((event, index) => {
    const link = opponentSync.links[index];
    return {
      team_id: team.id,
      title: cleanNuligaEventTitle(event),
      description: event.description,
      location: event.location,
      type: "match",
      starts_at: event.start,
      ends_at: event.end,
      source: "nuliga",
      source_uid: sourceUids[index],
      is_public: true,
      opponent_id: link?.opponent_id ?? null,
      opponent_team_no: link?.opponent_team_no ?? null,
      home_away: link?.home_away ?? "",
    };
  });

  let opponentLinkRetry = false;
  const moved: { id: string; title: string; alt: string; neu: string }[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const known = matchedExisting[index];
    if (!known) {
      const { error } = await admin.from("events").insert(row);
      if (!error) {
        result.neu++;
      } else if (error.code === "23505") {
        // Ein paralleler manueller/Cron-Lauf war schneller. Das eindeutige
        // source_uid macht den zweiten Insert zu einem harmlosen No-op.
        const { data: concurrent } = await admin
          .from("events")
          .select("id")
          .eq("source_uid", row.source_uid)
          .maybeSingle();
        if (concurrent) result.unveraendert++;
        else result.fehler.push(error.message);
      } else {
        result.fehler.push(error.message);
      }
      continue;
    }

    const patch: Record<string, unknown> = {};
    if (known.title !== row.title) patch.title = row.title;
    if ((known.description ?? "") !== row.description) {
      patch.description = row.description;
    }
    if ((known.location ?? "") !== row.location) patch.location = row.location;
    if (!sameInstant(known.starts_at, row.starts_at)) {
      patch.starts_at = row.starts_at;
    }
    if (!sameInstant(known.ends_at, row.ends_at)) patch.ends_at = row.ends_at;
    if (known.source_uid !== row.source_uid) patch.source_uid = row.source_uid;

    const sameOrEmptyOpponent =
      !known.opponent_id || known.opponent_id === row.opponent_id;
    if (!known.opponent_id && row.opponent_id) {
      patch.opponent_id = row.opponent_id;
    }
    if (
      sameOrEmptyOpponent &&
      known.opponent_team_no == null &&
      row.opponent_team_no != null
    ) {
      patch.opponent_team_no = row.opponent_team_no;
    }
    if (sameOrEmptyOpponent && !known.home_away && row.home_away) {
      patch.home_away = row.home_away;
    }

    if (Object.keys(patch).length === 0) {
      result.unveraendert++;
      continue;
    }

    const timeChanged = !sameInstant(known.starts_at, row.starts_at);
    let update = admin.from("events").update(patch).eq("id", known.id);
    // Bei Verlegungen verhindert der alte Zeitstempel, dass zwei parallele
    // Läufe dieselbe Änderung zweimal melden.
    if (timeChanged) update = update.eq("starts_at", known.starts_at);
    if ("opponent_id" in patch) update = update.is("opponent_id", null);
    if ("opponent_team_no" in patch) {
      update = update.is("opponent_team_no", null);
    }
    if ("home_away" in patch) {
      update = known.home_away == null
        ? update.is("home_away", null)
        : update.eq("home_away", known.home_away);
    }
    const { data: updated, error } = await update.select("id").maybeSingle();
    if (error) {
      result.fehler.push(error.message);
      if (
        "opponent_id" in patch ||
        "opponent_team_no" in patch ||
        "home_away" in patch
      ) {
        opponentLinkRetry = true;
      }
      continue;
    }
    if (!updated) {
      // Parallele oder manuelle Änderung hat Vorrang; beim nächsten Lauf wird
      // der dann aktuelle Stand erneut geprüft.
      result.unveraendert++;
      opponentLinkRetry = true;
      continue;
    }

    result.aktualisiert++;
    if (timeChanged && Date.parse(row.starts_at) > now) {
      moved.push({
        id: known.id,
        title: row.title,
        alt: known.starts_at,
        neu: row.starts_at,
      });
    }
  }

  // Ein zeitweise gekürzter Feed darf niemals Zusagen, Aufstellungen oder
  // Fahrgemeinschaften löschen. Nicht mehr gelieferte Zukunftstermine werden
  // deshalb nur im Lauf-Ergebnis gemeldet und vorsichtshalber beibehalten.
  if (authoritativeFeed) {
    result.verwaist = existing.filter(
      (event) =>
        Date.parse(event.starts_at) > now && !usedExistingIds.has(event.id),
    ).length;
  }

  if (
    opponentSync.retryableErrors ||
    opponentLinkRetry ||
    result.fehler.length > 0
  ) {
    await admin.from("app_settings").upsert({
      key: OPPONENT_BACKFILL_SETTING,
      value: "",
      updated_at: new Date().toISOString(),
    });
  }

  result.verlegt = moved.length;
  if (input.notifyMoves !== false) {
    await notifyMovedMatches(admin, team.id, moved);
  }
  if (
    result.neu > 0 ||
    result.aktualisiert > 0 ||
    opponentSync.opponentsCreated > 0 ||
    opponentSync.addressesAdded > 0
  ) {
    revalidateNuligaViews(team);
  }
  result.ok = result.fehler.length === 0;
  return result;
}

async function syncConfiguredTeam(
  admin: AdminClient,
  team: NuligaTeamConfig,
  input: Parameters<typeof syncTeamCalendar>[2],
): Promise<NuligaTeamSyncResult> {
  const deadline = input.deadline ?? Date.now() + 240_000;
  let result: NuligaTeamSyncResult;
  try {
    result = await syncTeamCalendar(admin, team, { ...input, deadline });
  } catch {
    result = errorResult(team.id, team.name, "Der Spielplan konnte nicht abgeglichen werden.");
  }
  // Veröffentlichte Ergebnisse können auch bei einem unveränderten oder
  // vorübergehend nicht erreichbaren iCal-Feed übernommen werden.
  try {
    result.statistik = await syncNuligaSpielberichte(admin, team, { deadline });
    result.fehler.push(...result.statistik.fehler);
  } catch {
    result.fehler.push("Ergebnisse und Liga-Statistik konnten nicht abgeglichen werden.");
  }
  if (
    (result.statistik?.neu ?? 0) + (result.statistik?.aktualisiert ?? 0)
      + (result.statistik?.ergebnisseNeu ?? 0) + (result.statistik?.ergebnisseAktualisiert ?? 0) > 0
  ) {
    revalidateNuligaViews(team);
  }
  result.ok = result.fehler.length === 0;
  return result;
}

/** Einen einzelnen, gespeicherten Mannschaftskalender abgleichen. */
export async function syncNuligaTeam(input: {
  teamId: string;
  icalUrl?: string;
  icalText?: string;
  notifyMoves?: boolean;
}): Promise<NuligaTeamSyncResult> {
  let admin: AdminClient;
  try {
    admin = createAdminSupabase();
  } catch {
    return errorResult(
      input.teamId,
      "Unbekannte Mannschaft",
      "Der automatische Import ist serverseitig nicht konfiguriert.",
    );
  }
  const { data, error } = await admin
    .from("teams")
    .select("id,name,league,slug,nuliga_ical_url,nuliga_table_url,nuliga_url")
    .eq("id", input.teamId)
    .maybeSingle();
  if (error || !data) {
    return errorResult(
      input.teamId,
      "Unbekannte Mannschaft",
      "Mannschaft wurde nicht gefunden.",
    );
  }
  return syncConfiguredTeam(admin, data as NuligaTeamConfig, input);
}

/** Alle Mannschaften mit hinterlegter nuLiga-iCal-Adresse abgleichen. */
export async function syncAllNuligaTeams(): Promise<NuligaAllSyncResult> {
  const deadline = Date.now() + 240_000;
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("teams")
    .select("id,name,league,slug,nuliga_ical_url,nuliga_table_url,nuliga_url")
    .not("nuliga_ical_url", "is", null)
    .neq("nuliga_ical_url", "")
    .order("sort_order");
  if (error) throw new Error("Mannschaften konnten nicht geladen werden.");

  const teams = (data ?? []) as NuligaTeamConfig[];
  const results: NuligaTeamSyncResult[] = [];
  // Bewusst nacheinander: Das vermeidet unnötige Parallelkonflikte beim
  // gemeinsamen Gegnerverzeichnis und lässt den Fehler eines Teams die
  // übrigen Mannschaften trotzdem nicht stoppen.
  for (const [index, team] of teams.entries()) {
    if (Date.now() >= deadline) {
      results.push(errorResult(team.id, team.name, "Zeitbudget erreicht; diese Mannschaft wird beim nächsten nuLiga-Abgleich erneut geprüft."));
      continue;
    }
    // Langsame Berichtsabrufe einer Mannschaft dürfen spätere Teams nicht
    // jeden Tag vom Abgleich ausschließen. Freies Restbudget wird weitergegeben.
    const teamDeadline = Date.now() + Math.floor((deadline - Date.now()) / (teams.length - index));
    try {
      results.push(await syncConfiguredTeam(admin, team, { deadline: teamDeadline }));
    } catch {
      results.push(
        errorResult(team.id, team.name, "Unerwarteter Fehler beim nuLiga-Abgleich."),
      );
    }
  }

  const sum = (field: keyof NuligaTeamSyncResult) =>
    results.reduce((total, result) => {
      const value = result[field];
      return total + (typeof value === "number" ? value : 0);
    }, 0);
  const failed = results.filter((result) => !result.ok).length;
  return {
    ok: failed === 0,
    teams: teams.length,
    erfolgreich: teams.length - failed,
    fehlgeschlagen: failed,
    gefunden: sum("gefunden"),
    neu: sum("neu"),
    aktualisiert: sum("aktualisiert"),
    unveraendert: sum("unveraendert"),
    verlegt: sum("verlegt"),
    verwaist: sum("verwaist"),
    berichteGeprueft: results.reduce((total, result) => total + (result.statistik?.geprueft ?? 0), 0),
    berichteNeu: results.reduce((total, result) => total + (result.statistik?.neu ?? 0), 0),
    berichteAktualisiert: results.reduce((total, result) => total + (result.statistik?.aktualisiert ?? 0), 0),
    ergebnisseNeu: results.reduce((total, result) => total + (result.statistik?.ergebnisseNeu ?? 0), 0),
    ergebnisseAktualisiert: results.reduce((total, result) => total + (result.statistik?.ergebnisseAktualisiert ?? 0), 0),
    ergebnisse: results,
  };
}

export function formatNuligaSyncMessage(result: NuligaTeamSyncResult): string {
  if (result.gefunden === 0 && result.fehler.length > 0 && !result.statistik) {
    return result.fehler[0];
  }
  const parts = [
    `${result.neu} Termine neu angelegt, ${result.aktualisiert} aktualisiert, ${result.unveraendert} unverändert.`,
    `Gegner: ${result.gegnerErkannt} erkannt, ${result.gegnerNeu} neu angelegt, ${result.adressenErgaenzt} Adressen ergänzt.`,
  ];
  if (result.statistik) {
    const statistik = result.statistik;
    if (statistik.nichtKonfiguriert) {
      parts.push("Ergebnisse und Liga-Statistik: Bitte die nuLiga-Adresse der Liga (Tabelle/Spielplan) hinterlegen.");
    } else {
      parts.push(`Ergebnisse: ${statistik.ergebnisseNeu} neu, ${statistik.ergebnisseAktualisiert} korrigiert, ${statistik.ergebnisseUnveraendert} unverändert.`);
      parts.push(`Liga-Statistik: ${statistik.neu} Spielberichte neu, ${statistik.aktualisiert} aktualisiert, ${statistik.unveraendert} unverändert.`);
    }
    if (statistik.nichtZugeordnet > 0) {
      parts.push(`${statistik.nichtZugeordnet} Ergebnisse waren keinem eindeutigen Termin zuordenbar.`);
    }
    if (statistik.konflikte > 0) {
      parts.push(`${statistik.konflikte} parallel bearbeitete Begegnungen werden beim nächsten Abgleich erneut geprüft.`);
    }
  }
  if (result.nichtZugeordnet > 0) {
    parts.push(`${result.nichtZugeordnet} Begegnungen waren nicht eindeutig zuordenbar.`);
  }
  if (result.verlegt > 0) {
    parts.push(
      `${result.verlegt} Verlegung${result.verlegt === 1 ? "" : "en"} erkannt – der Kader wurde benachrichtigt.`,
    );
  }
  if (result.verwaist > 0) {
    parts.push(
      `${result.verwaist} nicht mehr gelieferte Zukunftstermine wurden zur Sicherheit beibehalten.`,
    );
  }
  if (result.fehler.length > 0) {
    parts.push(`Fehler: ${result.fehler.join(" · ")}`);
  }
  return parts.join(" ");
}
