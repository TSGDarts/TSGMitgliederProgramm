import "server-only";

import { isDeepStrictEqual } from "node:util";
import { revalidatePath } from "next/cache";
import {
  nuligaSpielplanUrl,
  parseNuligaErgebnisse,
  parseNuligaSpielberichtHtml,
  type NuligaErgebnis,
} from "@/lib/nuliga-berichte";
import { normalizeOpponentName } from "@/lib/nuliga-opponents";
import { normalizeNuligaUrl } from "@/lib/nuliga-url";
import { alsMatchStats } from "@/lib/spielbericht";
import type { createAdminSupabase } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminSupabase>;

interface BerichtTeam {
  id: string;
  name: string;
  nuliga_table_url: string | null;
  nuliga_url: string | null;
}

interface BerichtEvent {
  id: string;
  description: string | null;
  starts_at: string;
  result: string | null;
  match_stats: unknown;
}

export interface NuligaStatistikSyncResult {
  ergebnisseNeu: number;
  ergebnisseAktualisiert: number;
  ergebnisseUnveraendert: number;
  geprueft: number;
  neu: number;
  aktualisiert: number;
  unveraendert: number;
  nichtZugeordnet: number;
  konflikte: number;
  nichtKonfiguriert: boolean;
  fehler: string[];
}

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_PARALLEL_HTML = 4;
const BUDGET_ERROR = "Das Zeitbudget für Ergebnisse und Liga-Statistik wurde erreicht; übrige Begegnungen werden beim nächsten Abgleich erneut geprüft.";
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);
const berlinDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Auch die Erste darf in der App ein explizites I am Namen tragen. */
function teamKey(name: string): string {
  return normalizeOpponentName(name).replace(/^tsg 08 roth i$/, "tsg 08 roth");
}

function eventTeams(description: string | null): { heim: string; gast: string } | null {
  const heim = /^\s*Heim:\s*(.+?)\s*$/im.exec(description ?? "")?.[1];
  const gast = /^\s*Gast:\s*(.+?)\s*$/im.exec(description ?? "")?.[1];
  return heim && gast ? { heim, gast } : null;
}

function budgetSignal(deadline: number, maximum = Number.POSITIVE_INFINITY): AbortSignal {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return AbortSignal.abort(new Error(BUDGET_ERROR));
  return AbortSignal.timeout(Math.ceil(Math.min(remaining, maximum)));
}

/** Jede Weiterleitung bleibt auf einer öffentlichen HTTPS-nuLiga-Adresse. */
async function loadNuligaHtml(rawUrl: string, deadline: number): Promise<string> {
  const initial = normalizeNuligaUrl(rawUrl);
  if (!initial) throw new Error("Ungültige nuLiga-Adresse.");
  let current: string = initial;
  const signal = budgetSignal(deadline, 10_000);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const response = await fetch(current, {
      cache: "no-store",
      redirect: "manual",
      signal,
    });
    if (REDIRECT_CODES.has(response.status)) {
      const location = response.headers.get("location");
      const next = location && normalizeNuligaUrl(new URL(location, current).toString());
      if (redirect === 3 || !next) throw new Error("Ungültige nuLiga-Weiterleitung.");
      current = next;
      continue;
    }
    if (!response.ok) throw new Error(`nuLiga antwortete mit Status ${response.status}.`);
    if (Number(response.headers.get("content-length") ?? 0) > MAX_HTML_BYTES) {
      throw new Error("Die nuLiga-Seite ist unerwartet groß.");
    }
    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) throw new Error("Die nuLiga-Seite ist unerwartet groß.");
    if (!/<table\b/i.test(html)) throw new Error("nuLiga lieferte keine Spielplan-/Berichtsseite.");
    return html;
  }
  throw new Error("Die nuLiga-Seite konnte nicht geladen werden.");
}

/** Ergänzt Ergebnisse und Berichte bestehender nuLiga-Termine dieser Mannschaft. */
export async function syncNuligaSpielberichte(
  admin: AdminClient,
  team: BerichtTeam,
  options: { deadline?: number } = {},
): Promise<NuligaStatistikSyncResult> {
  const deadline = options.deadline ?? Date.now() + 210_000;
  const result: NuligaStatistikSyncResult = {
    ergebnisseNeu: 0,
    ergebnisseAktualisiert: 0,
    ergebnisseUnveraendert: 0,
    geprueft: 0,
    neu: 0,
    aktualisiert: 0,
    unveraendert: 0,
    nichtZugeordnet: 0,
    konflikte: 0,
    nichtKonfiguriert: false,
    fehler: [],
  };
  const hasBudget = () => {
    if (Date.now() < deadline) return true;
    if (!result.fehler.includes(BUDGET_ERROR)) result.fehler.push(BUDGET_ERROR);
    return false;
  };
  const url = nuligaSpielplanUrl(team.nuliga_table_url ?? "")
    ?? nuligaSpielplanUrl(team.nuliga_url ?? "");
  if (!url) {
    result.nichtKonfiguriert = true;
    return result;
  }
  if (!hasBudget()) return result;

  let html: string;
  try {
    html = await loadNuligaHtml(url, deadline);
  } catch {
    if (hasBudget()) {
      result.fehler.push("Der nuLiga-Spielplan für Ergebnisse und Liga-Statistik war nicht erreichbar.");
    }
    return result;
  }
  const now = Date.now();
  const today = berlinDate.format(new Date(now));
  const ergebnisse = parseNuligaErgebnisse(html, url, team.name)
    .filter((entry) => entry.datum <= today);
  if (ergebnisse.length === 0) return result;
  if (!hasBudget()) return result;

  const { data, error } = await admin
    .from("events")
    .select("id,description,starts_at,result,match_stats")
    .eq("team_id", team.id)
    .eq("source", "nuliga")
    .like("source_uid", `nuliga:${team.id}:%`)
    .abortSignal(budgetSignal(deadline));
  if (error) {
    if (hasBudget()) result.fehler.push("Vorhandene Spieltermine konnten nicht geladen werden.");
    return result;
  }
  if (!hasBudget()) return result;
  const events = (data ?? []) as BerichtEvent[];
  const usedEvents = new Set<string>();
  const pending: { event: BerichtEvent; link: NuligaErgebnis & { berichtUrl: string } }[] = [];

  for (const link of ergebnisse) {
    if (!hasBudget()) break;
    const candidates = events.filter((event) => {
      const pair = eventTeams(event.description);
      const date = new Date(event.starts_at);
      return pair && Number.isFinite(date.getTime())
        && date.getTime() <= now && berlinDate.format(date) === link.datum
        && teamKey(pair.heim) === teamKey(link.heim)
        && teamKey(pair.gast) === teamKey(link.gast);
    });
    // Bei Doppelteinträgen niemals dieselbe Begegnung mehrfach übernehmen.
    if (candidates.length !== 1 || usedEvents.has(candidates[0].id)) {
      result.nichtZugeordnet++;
      continue;
    }
    const event = candidates[0];
    usedEvents.add(event.id);
    // Das veröffentlichte Endergebnis ist unabhängig vom Detailbericht verfügbar.
    // Hier keine Statistikdaten anfassen: Ein paralleler 3K-Import bleibt erhalten.
    if (event.result === link.ergebnis) {
      result.ergebnisseUnveraendert++;
    } else {
      let update = admin.from("events").update({ result: link.ergebnis })
        .eq("id", event.id).eq("starts_at", event.starts_at);
      update = event.description == null
        ? update.is("description", null)
        : update.eq("description", event.description);
      update = event.result == null
        ? update.is("result", null)
        : update.eq("result", event.result);
      const { data: saved, error: saveError } = await update
        .select("id").abortSignal(budgetSignal(deadline)).maybeSingle();
      if (saveError) {
        if (!hasBudget()) break;
        result.fehler.push(`Ergebnis vom ${link.datum} konnte nicht gespeichert werden.`);
        continue;
      }
      if (!saved) {
        result.konflikte++;
        continue;
      }
      if (event.result?.trim()) result.ergebnisseAktualisiert++;
      else result.ergebnisseNeu++;
      // Nachfolgende Bericht-Updates vergleichen gegen unseren neuen Ergebnisstand.
      event.result = link.ergebnis;
      revalidatePath(`/mitglieder/termine/${event.id}`);
    }
    if (link.berichtUrl) pending.push({ event, link: { ...link, berichtUrl: link.berichtUrl } });
  }

  // Fehlende Berichte haben Vorrang. Danach aktuelle Spiele zuerst, damit
  // ältere, vorübergehend kaputte Links neue Spieltage nicht aufhalten.
  pending.sort((left, right) =>
    Number(Boolean(alsMatchStats(left.event.match_stats)?.nuliga))
      - Number(Boolean(alsMatchStats(right.event.match_stats)?.nuliga))
      || right.link.datum.localeCompare(left.link.datum),
  );

  batches: for (let offset = 0; offset < pending.length; offset += MAX_PARALLEL_HTML) {
    if (!hasBudget()) break;
    const batch = pending.slice(offset, offset + MAX_PARALLEL_HTML);
    // Nur öffentliche HTML-Abrufe laufen parallel; Datenbankänderungen bleiben seriell.
    const loaded = await Promise.allSettled(
      batch.map(({ link }) => loadNuligaHtml(link.berichtUrl, deadline)),
    );
    for (let index = 0; index < batch.length; index++) {
      if (!hasBudget()) break batches;
      const { event, link } = batch[index];
      const report = loaded[index];
      if (report.status === "rejected") {
        const reason = report.reason instanceof Error ? report.reason.message : "Abruf fehlgeschlagen.";
        result.fehler.push(`Spielbericht vom ${link.datum} war nicht erreichbar (${reason}); beim nächsten Abgleich wird erneut geprüft.`);
        continue;
      }
      result.geprueft++;
      const parsed = parseNuligaSpielberichtHtml(report.value, link);
      if (!parsed.ok) {
        result.fehler.push(`Spielbericht vom ${link.datum}: ${parsed.fehler}`);
        continue;
      }
      const previous = alsMatchStats(event.match_stats) ?? {};
      const bericht = parsed.bericht;
      if (bericht.ergebnis !== link.ergebnis) {
        result.fehler.push(`Spielbericht vom ${link.datum} stimmt noch nicht mit dem veröffentlichten Endergebnis überein; die Statistik wird beim nächsten Abgleich erneut geprüft.`);
        continue;
      }
      if (isDeepStrictEqual(previous.nuliga, bericht) && event.result === bericht.ergebnis) {
        result.unveraendert++;
        continue;
      }
      if (!hasBudget()) break batches;

      let update = admin.from("events").update({
        match_stats: { ...previous, nuliga: bericht },
      }).eq("id", event.id).eq("starts_at", event.starts_at);
      // Auch eine parallele Verlegung oder Änderung der Begegnung hat Vorrang.
      update = event.description == null
        ? update.is("description", null)
        : update.eq("description", event.description);
      // Ein parallel eingespielter 3K-Bericht oder eine manuelle Korrektur hat Vorrang.
      update = event.match_stats == null
        ? update.is("match_stats", null)
        : update.eq("match_stats", JSON.stringify(event.match_stats));
      update = event.result == null
        ? update.is("result", null)
        : update.eq("result", event.result);
      const { data: saved, error: saveError } = await update
        .select("id").abortSignal(budgetSignal(deadline)).maybeSingle();
      if (saveError) {
        if (!hasBudget()) break batches;
        result.fehler.push(`Spielbericht vom ${link.datum} konnte nicht gespeichert werden.`);
        continue;
      }
      if (!saved) {
        result.konflikte++;
        continue;
      }
      if (previous.nuliga) result.aktualisiert++;
      else result.neu++;
      revalidatePath(`/mitglieder/termine/${event.id}`);
    }
  }

  if (result.neu + result.aktualisiert > 0) {
    revalidatePath("/mitglieder/profil");
    revalidatePath("/mitglieder/statistiken");
    revalidatePath("/mitglieder/admin/saisons/[id]", "page");
  }
  if (result.ergebnisseNeu + result.ergebnisseAktualisiert > 0) {
    revalidatePath("/mitglieder/ergebnisse");
  }
  return result;
}
