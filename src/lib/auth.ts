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

/**
 * Erzwingt Admin ODER Bearbeiter. Bearbeiter verwalten Termine (aller
 * Mannschaften), Gegner und Mannschaften – aber keine Mitglieder/Rollen.
 */
export async function requireEditor(): Promise<Profile> {
  const profile = await requireProfile("/mitglieder");
  if (profile.role !== "admin" && profile.role !== "editor") {
    redirect("/mitglieder");
  }
  return profile;
}

/** Darf Saisonplanungs-Entwürfe pflegen: Planer-Haken oder Admin. */
export function canPlanSeason(profile: Profile): boolean {
  return profile.role === "admin" || !!profile.is_planner;
}

/** Erzwingt einen Saisonplaner (oder Admin). Leitet sonst um. */
export async function requirePlanner(): Promise<Profile> {
  const profile = await requireProfile("/mitglieder");
  if (!canPlanSeason(profile)) {
    redirect("/mitglieder");
  }
  return profile;
}

/** Darf Trainings verwalten: Trainer-Haken oder Admin/Bearbeiter. */
export function canManageTrainings(profile: Profile): boolean {
  return (
    profile.role === "admin" ||
    profile.role === "editor" ||
    !!profile.is_trainer
  );
}

/** Erzwingt einen Trainer (oder Admin/Bearbeiter). Leitet sonst um. */
export async function requireTrainer(): Promise<Profile> {
  const profile = await requireProfile("/mitglieder");
  if (!canManageTrainings(profile)) {
    redirect("/mitglieder");
  }
  return profile;
}
