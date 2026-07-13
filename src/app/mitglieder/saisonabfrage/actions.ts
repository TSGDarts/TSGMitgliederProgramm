"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SURVEY_QUESTIONS } from "@/lib/season";

export type SurveyResult = { ok: boolean; message: string };

/** Liest eine Radio-Antwort; bei "Sonstiges" den Freitext übernehmen. */
function pick(formData: FormData, name: string): string {
  const v = String(formData.get(name) ?? "");
  if (v === "__other") {
    return String(formData.get(`${name}_other`) ?? "").trim();
  }
  return v;
}

export async function submitSurvey(
  _prev: SurveyResult | null,
  formData: FormData,
): Promise<SurveyResult> {
  const seasonId = String(formData.get("season_id") ?? "");
  if (!seasonId) return { ok: false, message: "Keine Saison angegeben." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Nicht angemeldet." };

  // Nur speichern, solange die Abfrage offen ist.
  const { data: season } = await supabase
    .from("seasons")
    .select("survey_open,status")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season || season.status !== "active" || !season.survey_open) {
    return { ok: false, message: "Die Saisonabfrage ist derzeit geschlossen." };
  }

  const playedRaw = String(formData.get("played_last_season") ?? "");
  const row: Record<string, unknown> = {
    season_id: seasonId,
    profile_id: user.id,
    played_last_season:
      playedRaw === "ja" ? true : playedRaw === "nein" ? false : null,
    team_wishes: String(formData.get("team_wishes") ?? "").trim(),
    updated_at: new Date().toISOString(),
  };
  for (const q of SURVEY_QUESTIONS) {
    row[q.field] = pick(formData, q.field);
  }

  const { error } = await supabase
    .from("survey_responses")
    .upsert(row, { onConflict: "season_id,profile_id" });

  if (error) return { ok: false, message: `Fehler beim Speichern: ${error.message}` };

  revalidatePath("/mitglieder/saisonabfrage");
  revalidatePath("/mitglieder");
  return {
    ok: true,
    message: "Danke! Deine Antworten sind gespeichert. Du kannst sie jederzeit ändern, solange die Abfrage offen ist.",
  };
}
