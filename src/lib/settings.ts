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

/**
 * Standard-Regelwerk für die Regeln-Seite. Der Admin kann den Text direkt
 * auf der Seite anpassen (app_settings-Schlüssel regeln_text). Aufbau:
 * Zeilen mit „# “ werden Überschriften, Zeilen mit „- “ werden Regeln,
 * alles andere normale Absätze.
 */
export const REGELN_STANDARD = `# 🤝 Fairplay & Verhalten
- Wir gehen respektvoll und freundlich miteinander um – auf und neben dem Board.
- Während des Wurfs wird nicht reingesprochen – egal für wen.
- Der wartende Spieler bleibt hinter dem Werfenden und bewegt sich nicht in dessen Sichtfeld.
- Vor und nach dem Spiel gibt man sich die Hand.
- Entscheidungen werden ruhig und sachlich besprochen – nicht während eines laufenden Legs.

# 📅 Termine & Zusagen
- Bitte bei jedem Termin rechtzeitig zu- oder absagen – die Kapitäne planen mit euren Antworten.
- Wer zugesagt hat, ist pünktlich da – bei Heimspielen am besten schon zum Aufbau.
- Kurzfristige Änderungen bitte direkt dem Kapitän melden (Anruf/WhatsApp).

# 🏠 Heimspiele & Seminarraum
- Auf- und Abbau machen wir gemeinsam – jeder packt mit an.
- Der Seminarraum wird sauber hinterlassen: Gläser wegräumen, Müll entsorgen, Material ordentlich verstauen.
- Getränke und Essen werden bar bezahlt.
- Wir sind Gäste im TSG-Gebäude: Rücksicht auf andere Abteilungen und Nachbarn.

# 💪 Training
- Training ist für alle da – Anfänger sind ausdrücklich willkommen.
- Boards und Material nach dem Training wieder aufräumen.

# 📱 App & Kommunikation
- Fragen gerne über die Fragen-Seite stellen – so haben alle etwas davon.
- Bitte das Profil aktuell halten (Handynummer, Benachrichtigungen), damit euch nichts entgeht.`;

/** Regelwerk-Text (Admin-Anpassung aus app_settings, sonst Standard). */
export async function getRegelnText(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "regeln_text")
    .maybeSingle();
  return (data?.value as string)?.trim() || REGELN_STANDARD;
}

/**
 * Kontakt für das Weiterleiten von Fragen (Pflege unter „Einstellungen“):
 * E-Mail-Adresse und WhatsApp-Nummer des Vereins/Vorstands. Leere Werte
 * blenden den jeweiligen Knopf aus.
 */
export async function getFragenKontakt(): Promise<{
  email: string;
  whatsapp: string;
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("app_settings")
    .select("key, value")
    .in("key", ["fragen_email", "fragen_whatsapp"]);
  const map = new Map(
    (data ?? []).map((s) => [s.key as string, (s.value as string) ?? ""]),
  );
  return {
    email: map.get("fragen_email") ?? "",
    whatsapp: map.get("fragen_whatsapp") ?? "",
  };
}

/** Telefonnummer ins wa.me-Format bringen (nur Ziffern, 0… → 49…). */
export function waNummer(telefon: string): string {
  let ziffern = telefon.replace(/\D/g, "");
  if (ziffern.startsWith("00")) ziffern = ziffern.slice(2);
  else if (ziffern.startsWith("0")) ziffern = `49${ziffern.slice(1)}`;
  return ziffern;
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
