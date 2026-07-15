import webpush from "web-push";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/supabase/config";
import type { EventRow } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/format";

// Zentraler Versand von Benachrichtigungen: Push an alle Geräte mit Abo,
// zusätzlich E-Mail an alle, die das im Profil eingeschaltet haben.
// Alles best-effort – ein Versand-Fehler darf nie das Speichern blockieren.

export interface Nachricht {
  title: string;
  body: string;
  url: string; // Pfad, z. B. /mitglieder/termine/<id>
}

function pushBereit(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Push an alle Geräte der genannten Profile; abgelaufene Abos aufräumen. */
async function sendePush(profileIds: string[], nachricht: Nachricht) {
  if (!pushBereit() || profileIds.length === 0) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:dart@tsg08roth.de",
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const admin = createAdminSupabase();
  const { data: abos } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("profile_id", profileIds);

  const payload = JSON.stringify(nachricht);
  await Promise.allSettled(
    (abos ?? []).map(async (abo) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: abo.endpoint as string,
            keys: { p256dh: abo.p256dh as string, auth: abo.auth as string },
          },
          payload,
        );
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        // 404/410 = Abo existiert nicht mehr (App deinstalliert o. Ä.)
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", abo.id);
        }
      }
    }),
  );
}

/** E-Mail an alle Empfänger mit eingeschalteter E-Mail-Benachrichtigung. */
async function sendeMails(profileIds: string[], nachricht: Nachricht) {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || profileIds.length === 0) return;

  const admin = createAdminSupabase();
  const { data: empfaenger } = await admin
    .from("profiles")
    .select("email")
    .in("id", profileIds)
    .eq("notify_email", true)
    .eq("is_active", true)
    .not("email", "is", null);
  const adressen = (empfaenger ?? [])
    .map((p) => p.email as string)
    .filter(Boolean);
  if (!adressen.length) return;

  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  // Einzeln als BCC-freundlicher Versand (keine Adressen untereinander zeigen)
  await Promise.allSettled(
    adressen.map((to) =>
      transport.sendMail({
        from: process.env.SMTP_FROM ?? SMTP_USER,
        to,
        subject: nachricht.title,
        text: `${nachricht.body}\n\n${siteUrl}${nachricht.url}\n\n– TSG 08 Roth Dart (Einstellungen unter „Mein Profil“)`,
      }),
    ),
  );
}

/** Versand an eine feste Empfängerliste (Push immer, E-Mail je Einstellung). */
export async function benachrichtige(
  profileIds: string[],
  nachricht: Nachricht,
) {
  try {
    await Promise.allSettled([
      sendePush(profileIds, nachricht),
      sendeMails(profileIds, nachricht),
    ]);
  } catch {
    // best-effort
  }
}

/**
 * Empfänger für einen Termin: Einladungsliste, sonst Mannschafts-Kader,
 * sonst alle aktiven Mitglieder. Der Auslöser selbst wird ausgenommen.
 */
async function empfaengerFuerEvent(
  event: Pick<EventRow, "team_id">,
  inviteeIds: string[],
  ausserId?: string,
): Promise<string[]> {
  const admin = createAdminSupabase();
  let ids: string[] = [];
  if (inviteeIds.length > 0) {
    ids = inviteeIds;
  } else if (event.team_id) {
    const { data } = await admin
      .from("team_members")
      .select("profile_id")
      .eq("team_id", event.team_id);
    ids = (data ?? []).map((m) => m.profile_id as string);
  } else {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("is_active", true);
    ids = (data ?? []).map((p) => p.id as string);
  }
  return ids.filter((id) => id && id !== ausserId);
}

/** Kurze Datumszeile für die Nachricht („Sa., 18.07.2026, 16:30 Uhr“). */
function terminZeile(ev: Pick<EventRow, "starts_at" | "time_tbd">): string {
  const datum = formatDate(ev.starts_at);
  if (ev.time_tbd || formatTime(ev.starts_at) === "00:00") {
    return `${datum} – Uhrzeit folgt`;
  }
  return `${datum}, ${formatTime(ev.starts_at)} Uhr`;
}

/** Benachrichtigung „Neuer Termin“ an alle relevanten Mitglieder. */
export async function meldeNeuenTermin(
  event: Pick<EventRow, "id" | "title" | "team_id" | "starts_at" | "time_tbd" | "type">,
  inviteeIds: string[],
  ausserId?: string,
) {
  try {
    const empfaenger = await empfaengerFuerEvent(event, inviteeIds, ausserId);
    const art = event.type === "training" ? "Neues Training" : "Neuer Termin";
    await benachrichtige(empfaenger, {
      title: `${art}: ${event.title}`,
      body: `${terminZeile(event)} – jetzt zu- oder absagen.`,
      url: `/mitglieder/termine/${event.id}`,
    });
  } catch {
    // best-effort
  }
}
