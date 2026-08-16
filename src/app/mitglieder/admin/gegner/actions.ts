"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { composeAddress } from "@/lib/extras";
import {
  normalizeOpponentName,
  parseNuligaMatch,
} from "@/lib/nuliga-opponents";
import {
  deterministicOpponentId,
  OPPONENT_BACKFILL_SETTING,
  syncImportedOpponents,
} from "@/lib/nuliga-opponent-sync";

function revalidate() {
  revalidatePath("/mitglieder/admin/gegner");
  revalidatePath("/mitglieder/admin/termine");
}

function readAddress(formData: FormData) {
  const street = String(formData.get("street") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const boardsRaw = Number(formData.get("boards") ?? 0);
  return {
    street,
    zip,
    city,
    address: composeAddress(street, zip, city),
    boards: boardsRaw >= 1 ? boardsRaw : null,
  };
}

type ImportedEvent = {
  id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  opponent_id: string | null;
  opponent_team_no: number | null;
  home_away: string | null;
};

type ImportedTeam = {
  id: string;
  name: string;
  league: string | null;
};

const BACKFILL_PAGE_SIZE = 1000;

async function loadNuligaEvents(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ rows: ImportedEvent[]; failed: boolean }> {
  const rows: ImportedEvent[] = [];

  for (let start = 0; ; start += BACKFILL_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("events")
      .select(
        "id,team_id,title,description,location,opponent_id,opponent_team_no,home_away",
      )
      .eq("source", "nuliga")
      .order("starts_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + BACKFILL_PAGE_SIZE - 1);
    if (error) return { rows, failed: true };

    const page = (data ?? []) as ImportedEvent[];
    rows.push(...page);
    if (page.length < BACKFILL_PAGE_SIZE) return { rows, failed: false };
  }
}

async function completeBackfillMarker(
  supabase: Awaited<ReturnType<typeof createClient>>,
  startedAt: string,
): Promise<"completed" | "superseded" | "failed"> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("app_settings")
    .update({ value: now, updated_at: now })
    .eq("key", OPPONENT_BACKFILL_SETTING)
    .eq("value", "")
    .eq("updated_at", startedAt)
    .select("key")
    .maybeSingle();
  if (error) return "failed";
  return data ? "completed" : "superseded";
}

export type OpponentBackfillResult = { ok: boolean; message: string };

/**
 * Zieht Gegner-Verknüpfungen aus nuLiga-Terminen nach, die vor Einführung
 * des automatischen Gegnerimports gespeichert wurden.
 */
export async function backfillNuligaOpponents(): Promise<OpponentBackfillResult> {
  await requireEditor();
  const supabase = await createClient();
  const startedAt = new Date().toISOString();
  const { error: markerError } = await supabase.from("app_settings").upsert({
    key: OPPONENT_BACKFILL_SETTING,
    value: "",
    updated_at: startedAt,
  });
  if (markerError) {
    return {
      ok: false,
      message: "Der automatische Gegner-Abgleich konnte nicht gestartet werden.",
    };
  }

  const [eventsResult, teamsResult] = await Promise.all([
    loadNuligaEvents(supabase),
    supabase.from("teams").select("id,name,league"),
  ]);

  if (eventsResult.failed || teamsResult.error) {
    return {
      ok: false,
      message: "Die vorhandenen nuLiga-Termine konnten nicht gelesen werden.",
    };
  }

  const events = eventsResult.rows;
  if (events.length === 0) {
    const markerResult = await completeBackfillMarker(supabase, startedAt);
    if (markerResult === "failed") {
      return {
        ok: false,
        message: "Der automatische Gegner-Abgleich konnte nicht abgeschlossen werden.",
      };
    }
    revalidatePath("/mitglieder/admin/gegner");
    return {
      ok: true,
      message:
        markerResult === "completed"
          ? "Keine nuLiga-Termine zum Nachholen gefunden."
          : "Keine nuLiga-Termine gefunden; ein neuerer Abgleich bleibt vorgemerkt.",
    };
  }

  const teams = new Map(
    ((teamsResult.data ?? []) as ImportedTeam[]).map((team) => [team.id, team]),
  );
  const parsedMatches = events.map((event) => {
    const team = event.team_id ? teams.get(event.team_id) : undefined;
    if (!team) return null;
    return parseNuligaMatch(
      {
        summary: event.title,
        description: event.description ?? "",
        location: event.location ?? "",
      },
      team.name,
      team.league ?? "",
    );
  });
  // Gemeinsam auflösen, damit mehrdeutige Vereinsnamen mit römischer Endung
  // über alle eigenen Mannschaften hinweg einheitlich behandelt werden.
  const opponentSync = await syncImportedOpponents(
    supabase,
    parsedMatches,
    events.map((event) => event.opponent_id),
  );
  const opponentIds = new Set<string>();
  let eventsUpdated = 0;
  let hadErrors = opponentSync.hadErrors;
  let retryableErrors = opponentSync.retryableErrors;

  for (let index = 0; index < events.length; index++) {
    const event = events[index];
    const link = opponentSync.links[index];
    if (!link?.opponent_id) continue;
    opponentIds.add(link.opponent_id);

    const updates: {
      field: "opponent_id" | "opponent_team_no" | "home_away";
      value: string | number;
      expected: string | number | null;
    }[] = [];
    const sameOrEmptyOpponent =
      !event.opponent_id || event.opponent_id === link.opponent_id;
    if (!event.opponent_id) {
      updates.push({
        field: "opponent_id",
        value: link.opponent_id,
        expected: event.opponent_id,
      });
    }
    if (
      sameOrEmptyOpponent &&
      event.opponent_team_no == null &&
      link.opponent_team_no != null
    ) {
      updates.push({
        field: "opponent_team_no",
        value: link.opponent_team_no,
        expected: event.opponent_team_no,
      });
    }
    if (sameOrEmptyOpponent && !event.home_away) {
      updates.push({
        field: "home_away",
        value: link.home_away,
        expected: event.home_away,
      });
    }
    if (updates.length === 0) continue;

    const updateValues = Object.fromEntries(
      updates.map((update) => [update.field, update.value]),
    );
    let conditionalUpdate = supabase
      .from("events")
      .update(updateValues)
      .eq("id", event.id);
    if (!updates.some((update) => update.field === "opponent_id")) {
      conditionalUpdate = conditionalUpdate.eq(
        "opponent_id",
        link.opponent_id,
      );
    }
    for (const update of updates) {
      conditionalUpdate =
        update.expected == null
          ? conditionalUpdate.is(update.field, null)
          : conditionalUpdate.eq(update.field, update.expected);
    }
    const { data: updated, error } = await conditionalUpdate
      .select("id")
      .maybeSingle();
    if (error) {
      hadErrors = true;
      retryableErrors = true;
    } else if (updated) {
      eventsUpdated++;
    } else {
      // Die optimistische Bedingung kann bei einer gleichzeitigen manuellen
      // Änderung ins Leere laufen. Nur abschließen, wenn die gewünschten
      // Angaben inzwischen anderweitig vollständig gesetzt wurden.
      const { data: current, error: reloadError } = await supabase
        .from("events")
        .select("opponent_id,opponent_team_no,home_away")
        .eq("id", event.id)
        .maybeSingle();
      if (reloadError) {
        hadErrors = true;
        retryableErrors = true;
      } else if (current) {
        const currentOpponentId = (current.opponent_id as string | null) ?? null;
        const manuallyReassigned =
          currentOpponentId != null && currentOpponentId !== link.opponent_id;
        const stillIncomplete =
          !currentOpponentId ||
          (link.opponent_team_no != null &&
            current.opponent_team_no == null) ||
          !current.home_away;
        if (!manuallyReassigned && stillIncomplete) {
          hadErrors = true;
          retryableErrors = true;
        }
      }
    }
  }

  if (!retryableErrors) {
    const markerResult = await completeBackfillMarker(supabase, startedAt);
    if (markerResult === "failed") {
      hadErrors = true;
      retryableErrors = true;
    } else if (markerResult === "superseded") {
      retryableErrors = true;
    }
  }

  revalidatePath("/mitglieder/admin/gegner");
  revalidatePath("/mitglieder/admin/termine");
  revalidatePath("/mitglieder/termine");
  revalidatePath("/termine");

  const parts = [
    `${opponentIds.size} Gegner erkannt`,
    `${opponentSync.opponentsCreated} neu übernommen`,
    `${eventsUpdated} Spieltage ergänzt`,
    `${opponentSync.addressesAdded} Adressen ergänzt`,
  ];
  if (opponentSync.unrecognized > 0) {
    parts.push(
      `${opponentSync.unrecognized} Termine nicht eindeutig zugeordnet`,
    );
  }
  if (hadErrors) parts.push("einige Daten konnten nicht gespeichert werden");

  return {
    ok: !hadErrors,
    message: `${parts.join(", ")}.`,
  };
}

export async function createOpponent(formData: FormData) {
  await requireEditor();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const normalizedName = normalizeOpponentName(name);
  const { data: existingOpponents } = await supabase
    .from("opponents")
    .select("id,name");
  if (
    (existingOpponents ?? []).some(
      (opponent) =>
        normalizeOpponentName(opponent.name as string) === normalizedName,
    )
  ) {
    revalidate();
    return;
  }

  const payload = {
    name,
    ...readAddress(formData),
    contact_name: String(formData.get("contact_name") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = deterministicOpponentId(normalizedName, attempt);
    const { error } = await supabase
      .from("opponents")
      .insert({ id, ...payload });
    if (!error) break;
    if (error.code !== "23505") break;

    const { data: collision } = await supabase
      .from("opponents")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    if (
      collision &&
      normalizeOpponentName(collision.name as string) === normalizedName
    ) {
      break;
    }
  }
  revalidate();
}

export async function updateOpponent(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!id || !name) return;

  const supabase = await createClient();
  await supabase
    .from("opponents")
    .update({
      name,
      ...readAddress(formData),
      contact_name: String(formData.get("contact_name") ?? "").trim(),
      notes: String(formData.get("notes") ?? "").trim(),
    })
    .eq("id", id);
  revalidate();
}

export async function deleteOpponent(formData: FormData) {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("opponents").delete().eq("id", id);
  revalidate();
}

/** Vorlage für die Heimspiel-Nachricht an den Gegner speichern. */
export async function saveGegnerVorlage(formData: FormData) {
  await requireEditor();
  const text = String(formData.get("vorlage") ?? "").trim();

  const supabase = await createClient();
  await supabase.from("app_settings").upsert({
    key: "gegner_vorlage",
    value: text,
    updated_at: new Date().toISOString(),
  });
  revalidate();
}

/** Eigene Heimspielstätte (wird bei Heimterminen als Ort verwendet). */
export async function saveHomeAddress(formData: FormData) {
  await requireEditor();
  const { street, zip, city, address } = readAddress(formData);

  const supabase = await createClient();
  const now = new Date().toISOString();
  await supabase.from("app_settings").upsert([
    { key: "home_street", value: street, updated_at: now },
    { key: "home_zip", value: zip, updated_at: now },
    { key: "home_city", value: city, updated_at: now },
    { key: "home_address", value: address, updated_at: now },
  ]);
  revalidate();
}
