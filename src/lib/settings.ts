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
 * Standard-Vorlage für die Nachricht an den Gegner vor Heimspielen.
 * Platzhalter werden automatisch gefüllt: {ansprechpartner}, {kapitaen},
 * {mannschaft}, {datum}, {uhrzeit}. Der Admin kann die Vorlage unter
 * „Gegner verwalten“ anpassen (app_settings-Schlüssel gegner_vorlage).
 */
export const GEGNER_VORLAGE_STANDARD = `Hallo {ansprechpartner},
ich bin der {kapitaen} von der {mannschaft}.
Ihr spielt am {datum} um {uhrzeit} Uhr bei uns.
Ein paar Kleinigkeiten vorab:

Anreise:
Von den Parkplätzen der TSG, Ostring 28, 91154 Roth, in Richtung Gaststätte Waldblick laufen. Dort die Treppe hoch zur Terrasse des Restaurants.
Vor dem Eingang des Restaurants links in das TSG-Gebäude gehen.
Im TSG-Gebäude rechts bis zur Treppe gehen.
Dort nach oben gehen und gegenüber der Geschäftsstelle ist der Seminarraum, dort wird der Spieltag gespielt!
Die Toiletten sind die Treppe runter.
Rauchen ist vor der TSG auf der Terrasse des Waldblicks möglich.

Verpflegung:
An Getränken haben wir alle möglichen Biersorten von Spalter und Weizen von Gutmann. Alkoholfreie Getränke gibt es auch in ausreichender Auswahl. Schnaps haben wir auch in verschiedenen Sorten. In der Halbzeit gibt es natürlich auch eine Bumbamaß/Schwarze pro Mannschaft.
Zum Essen würden wir vor Spielbeginn im Waldblick bestellen, so dass wir zur Halbzeit essen können. Hier der Link des Restaurants (https://waldblick-roth.de/speisekarte/), damit ihr euch schon mal vorab entscheiden könnt.
Bezahlt wird das Essen und die Getränke dann bei uns im Seminarraum, hier ist nur Barzahlung möglich.

Spielbetrieb:
Wir spielen alle unsere Ligaspiele über die 2k Software. Hier könnt ihr entweder auf der 2k-Webseite (https://www.2k-dart-software.com/frontend/events) die TSG 08 Roth suchen oder ihr scannt vor Ort den Barcode ein, den wir euch zur Verfügung stellen. So können auch Freunde/Leute, die nicht physisch beim Spiel dabei sind, das Spiel live mitverfolgen!
Ab einer Stunde vor Spielbeginn ist bei uns in der Regel immer einer da.`;

/**
 * Spielmodi je Wettbewerb (frei editierbarer Text, Pflege unter
 * „Mannschaften verwalten“) – angezeigt bei Spiel-Terminen und in der
 * Aufstellung.
 */
export async function getSpielModi(): Promise<{
  liga: string;
  pokal: string;
  achter: string;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["modus_liga", "modus_pokal", "modus_8er"]);
  const map = new Map(
    (data ?? []).map((s) => [s.key as string, (s.value as string) ?? ""]),
  );
  return {
    liga: map.get("modus_liga") ?? "4 Einzel – 2 Doppel – 4 Einzel – 2 Doppel",
    pokal: map.get("modus_pokal") ?? "",
    achter: map.get("modus_8er") ?? "",
  };
}

export async function getGegnerVorlage(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "gegner_vorlage")
    .maybeSingle();
  return (data?.value as string) || GEGNER_VORLAGE_STANDARD;
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
