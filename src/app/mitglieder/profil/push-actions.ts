"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Push-Abo dieses Geräts speichern (ein Eintrag pro Gerät/Browser). */
export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}): Promise<{ ok: boolean; message?: string }> {
  const profile = await requireProfile();
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { ok: false, message: "Ungültiges Push-Abo." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      profile_id: profile.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return {
      ok: false,
      message: /relation|schema/i.test(error.message)
        ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
        : error.message,
    };
  }
  return { ok: true };
}

/** Push-Abo dieses Geräts löschen. */
export async function deletePushSubscription(endpoint: string) {
  await requireProfile();
  if (!endpoint) return { ok: false };
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return { ok: true };
}
