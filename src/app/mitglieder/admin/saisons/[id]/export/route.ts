import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  surveyLabel,
  type Season,
  type SurveyResponse,
  type SurveyAnswers,
} from "@/lib/season";
import type { Profile } from "@/lib/types";

/** Ein Feld CSV-sicher machen (Semikolon-Format für deutsches Excel). */
function csv(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function answerRow(name: string, status: string, r: SurveyAnswers | null): string {
  const played =
    r?.played_last_season === true
      ? "Ja"
      : r?.played_last_season === false
        ? "Nein"
        : "";
  const cells = [
    name,
    status,
    r ? "Ja" : "Nein",
    played,
    r ? surveyLabel("play_frequency", r.play_frequency) : "",
    r ? surveyLabel("captain_interest", r.captain_interest) : "",
    r?.team_wishes ?? "",
    r ? surveyLabel("ambitions", r.ambitions) : "",
    r ? surveyLabel("sit_out", r.sit_out) : "",
    r ? surveyLabel("pokal_ku", r.pokal_ku) : "",
    r ? surveyLabel("pokal_8er", r.pokal_8er) : "",
  ];
  return cells.map((c) => csv(c.replace(/—/g, ""))).join(";");
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile || profile.role !== "admin") {
    return new NextResponse("Nur für Admins.", { status: 403 });
  }

  const { id } = await params;
  const supabase = await createClient();

  const { data: seasonData } = await supabase
    .from("seasons")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!seasonData) return new NextResponse("Saison nicht gefunden.", { status: 404 });
  const season = seasonData as Season;

  const [{ data: profData }, { data: respData }, { data: invData }, { data: invRespData }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("is_active", true)
        .neq("role", "member")
        .order("full_name"),
      supabase.from("survey_responses").select("*").eq("season_id", id),
      supabase
        .from("member_invites")
        .select("id, full_name, role")
        .eq("claimed", false)
        .neq("role", "member")
        .order("full_name"),
      supabase.from("survey_responses_invites").select("*").eq("season_id", id),
    ]);

  const responses = new Map(
    ((respData as SurveyResponse[]) ?? []).map((r) => [r.profile_id, r]),
  );
  const inviteResponses = new Map(
    (invRespData ?? []).map((r) => [
      r.invite_id as string,
      r as unknown as SurveyAnswers,
    ]),
  );

  const header = [
    "Name",
    "Status",
    "Beantwortet",
    "Letztes Jahr Liga",
    "Einsatz",
    "Kapitän",
    "Wünsche",
    "Ambitionen",
    "Aussetzen",
    "KU-Pokal",
    "8ter Cup",
  ]
    .map(csv)
    .join(";");

  const lines: string[] = [header];
  for (const p of (profData as Profile[]) ?? []) {
    lines.push(
      answerRow(
        p.full_name || p.email || "?",
        "registriert",
        responses.get(p.id) ?? null,
      ),
    );
  }
  for (const inv of invData ?? []) {
    lines.push(
      answerRow(
        inv.full_name as string,
        "noch nicht registriert",
        inviteResponses.get(inv.id as string) ?? null,
      ),
    );
  }

  // BOM voranstellen, damit Excel die Umlaute korrekt anzeigt
  const body = "﻿" + lines.join("\r\n");
  const filename = `saisonabfrage-${season.name.replace(/[^a-zA-Z0-9äöüÄÖÜß]+/g, "-")}.csv`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
