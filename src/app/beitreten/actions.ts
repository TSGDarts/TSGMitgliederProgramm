"use server";

import { redirect } from "next/navigation";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isValidJoinToken } from "@/lib/invites";

export type ClaimResult = { ok: boolean; message: string };

export async function claimMember(
  _prev: ClaimResult | null,
  formData: FormData,
): Promise<ClaimResult> {
  const token = String(formData.get("token") ?? "");
  const inviteId = String(formData.get("invite_id") ?? "");
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const password2 = String(formData.get("password2") ?? "");

  if (!(await isValidJoinToken(token))) {
    return {
      ok: false,
      message:
        "Dieser Link ist ungültig oder abgelaufen. Bitte den Verein um einen neuen Link/QR-Code.",
    };
  }
  if (!inviteId) return { ok: false, message: "Bitte wähle deinen Namen aus." };
  if (!email || !email.includes("@")) {
    return { ok: false, message: "Bitte gib eine gültige E-Mail-Adresse an." };
  }
  if (password.length < 8) {
    return { ok: false, message: "Das Passwort muss mindestens 8 Zeichen haben." };
  }
  if (password !== password2) {
    return { ok: false, message: "Die Passwörter stimmen nicht überein." };
  }

  const admin = createAdminSupabase();

  const { data: invite } = await admin
    .from("member_invites")
    .select("*")
    .eq("id", inviteId)
    .maybeSingle();

  if (!invite || invite.claimed) {
    return {
      ok: false,
      message: "Dieser Name ist nicht mehr verfügbar. Bitte lade die Seite neu.",
    };
  }

  const { data: created, error: createErr } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: invite.full_name, role: invite.role },
    });

  if (createErr || !created?.user) {
    const already =
      createErr?.message?.toLowerCase().includes("already") ||
      createErr?.status === 422;
    return {
      ok: false,
      message: already
        ? "Diese E-Mail wird schon verwendet. Nimm eine andere – oder melde dich direkt an."
        : `Es ist ein Fehler aufgetreten: ${createErr?.message ?? "unbekannt"}`,
    };
  }

  const userId = created.user.id;

  await admin
    .from("profiles")
    .update({ full_name: invite.full_name, role: invite.role, email })
    .eq("id", userId);

  const teamIds = (invite.team_ids as string[]) ?? [];
  if (teamIds.length) {
    await admin
      .from("team_members")
      .insert(teamIds.map((team_id) => ({ team_id, profile_id: userId })));
  }

  await admin
    .from("member_invites")
    .update({ claimed: true, claimed_profile_id: userId })
    .eq("id", inviteId);

  // Vom Admin bereits nachgetragene Saisonabfrage-Antworten übernehmen.
  const { data: invAnswers } = await admin
    .from("survey_responses_invites")
    .select("*")
    .eq("invite_id", inviteId);
  if (invAnswers && invAnswers.length > 0) {
    await admin.from("survey_responses").upsert(
      invAnswers.map((a) => ({
        season_id: a.season_id,
        profile_id: userId,
        played_last_season: a.played_last_season,
        play_frequency: a.play_frequency,
        captain_interest: a.captain_interest,
        team_wishes: a.team_wishes,
        ambitions: a.ambitions,
        sit_out: a.sit_out,
        pokal_ku: a.pokal_ku,
        pokal_8er: a.pokal_8er,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "season_id,profile_id" },
    );
    await admin
      .from("survey_responses_invites")
      .delete()
      .eq("invite_id", inviteId);
  }

  // Pokal-Zuordnungen vom angelegten Namen aufs neue Konto übertragen.
  const { data: pokalRows } = await admin
    .from("pokal_squads")
    .select("id, season_id, kind, team_no")
    .eq("invite_id", inviteId);
  if (pokalRows && pokalRows.length > 0) {
    for (const row of pokalRows) {
      await admin.from("pokal_squads").insert({
        season_id: row.season_id,
        kind: row.kind,
        team_no: row.team_no ?? 1,
        profile_id: userId,
      }); // Duplikate scheitern still
    }
    await admin.from("pokal_squads").delete().eq("invite_id", inviteId);
  }

  // Direkt anmelden (Session setzen) und ins Dashboard.
  const supabase = await createClient();
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signErr) {
    redirect("/login?angemeldet=1");
  }
  redirect("/mitglieder");
}
