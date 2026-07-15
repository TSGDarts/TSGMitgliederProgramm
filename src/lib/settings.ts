import { createClient } from "@/lib/supabase/server";
import { berlinLocalToISO } from "@/lib/tz";

/**
 * Archiv-Frist für Termine: so viele Tage nach ihrem Datum verschwinden
 * Termine aus Listen und Kalender (bleiben aber in der Datenbank und im
 * Dart-Feed erhalten). Einstellbar unter „Termine verwalten“.
 */
export async function getEventArchiveDays(): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "event_archive_days")
    .maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 1 && n <= 365 ? Math.round(n) : 30;
}

/**
 * Beginn des ältesten noch sichtbaren Kalendertags (Berlin, 00:00 Uhr) als
 * ISO-Zeitpunkt. Wichtig: in GANZEN Tagen rechnen – sonst fallen
 * Mitternachts-Termine ein paar Stunden zu früh aus der Frist (Kalender
 * und Listen wären dann uneinig).
 */
export function archiveCutoffIso(archiveDays: number): string {
  const tag = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - archiveDays * 864e5));
  const iso = berlinLocalToISO(`${tag}T00:00`);
  return iso
    ? new Date(iso).toISOString()
    : new Date(Date.now() - archiveDays * 864e5).toISOString();
}
