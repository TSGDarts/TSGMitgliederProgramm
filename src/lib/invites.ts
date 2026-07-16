import "server-only";

import { createAdminSupabase } from "@/lib/supabase/admin";

const JOIN_TOKEN_KEY = "join_token";

function newToken(): string {
  return (
    crypto.randomUUID().replace(/-/g, "") +
    crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  );
}

/** Liefert den aktuellen Beitritts-Token; legt beim ersten Mal einen an. */
export async function getOrCreateJoinToken(): Promise<string> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", JOIN_TOKEN_KEY)
    .maybeSingle();

  if (data?.value) return data.value as string;

  const token = newToken();
  await admin
    .from("app_settings")
    .upsert({ key: JOIN_TOKEN_KEY, value: token, updated_at: new Date().toISOString() });
  return token;
}

/** Erzeugt einen neuen Token (alte Links werden damit ungültig). */
export async function regenerateJoinToken(): Promise<string> {
  const admin = createAdminSupabase();
  const token = newToken();
  await admin
    .from("app_settings")
    .upsert({ key: JOIN_TOKEN_KEY, value: token, updated_at: new Date().toISOString() });
  return token;
}

export async function isValidJoinToken(token: string): Promise<boolean> {
  if (!token) return false;
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", JOIN_TOKEN_KEY)
    .maybeSingle();
  return Boolean(data?.value) && data!.value === token;
}

export type UnclaimedInvite = { id: string; full_name: string };

/** Heutiger Kalendertag in Berlin (JJJJ-MM-TT) – für Austritts-Vergleiche. */
export function berlinHeute(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Ist die Person (Profil oder Name) zum Stichtag ausgetreten? */
export function istAusgetreten(leftOn?: string | null): boolean {
  return !!leftOn && leftOn <= berlinHeute();
}

export async function listUnclaimedInvites(): Promise<UnclaimedInvite[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("member_invites")
    .select("id, full_name, left_on")
    .eq("claimed", false)
    .order("full_name");
  // Ausgetretene Namen sind bei der Selbst-Anmeldung nicht mehr wählbar
  return ((data as (UnclaimedInvite & { left_on?: string | null })[]) ?? [])
    .filter((i) => !istAusgetreten(i.left_on))
    .map(({ id, full_name }) => ({ id, full_name }));
}
