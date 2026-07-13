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

export async function listUnclaimedInvites(): Promise<UnclaimedInvite[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("member_invites")
    .select("id, full_name")
    .eq("claimed", false)
    .order("full_name");
  return (data as UnclaimedInvite[]) ?? [];
}
