import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { EventRow, Team } from "@/lib/types";

// Alle Mannschaften (sortiert). Leer, solange Supabase nicht eingerichtet ist.
export async function getTeams(): Promise<Team[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  return (data as Team[]) ?? [];
}

export async function getTeamBySlug(slug: string): Promise<Team | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("teams")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as Team) ?? null;
}

// Kommende öffentliche Termine.
export async function getPublicUpcomingEvents(limit = 50): Promise<EventRow[]> {
  if (!isSupabaseConfigured) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .eq("is_public", true)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(limit);
  return (data as EventRow[]) ?? [];
}
