import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Profile } from "@/lib/types";

/**
 * Liefert das Profil des aktuell eingeloggten Nutzers oder null.
 * Ohne Supabase-Konfiguration gilt niemand als eingeloggt.
 */
export async function getCurrentProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

/**
 * Erzwingt einen eingeloggten, aktiven Nutzer. Leitet sonst zur Login-Seite um.
 */
export async function requireProfile(nextPath = "/mitglieder"): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) {
    redirect(`/login?weiter=${encodeURIComponent(nextPath)}`);
  }
  if (!profile.is_active) {
    redirect("/login?fehler=gesperrt");
  }
  return profile;
}

/**
 * Erzwingt einen eingeloggten Admin. Leitet sonst um.
 */
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile("/mitglieder");
  if (profile.role !== "admin") {
    redirect("/mitglieder");
  }
  return profile;
}
