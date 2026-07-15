import { createClient } from "@/lib/supabase/server";

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
