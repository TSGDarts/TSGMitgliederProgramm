import "server-only";

import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import {
  normalizeOpponentName,
  resolveNuligaOpponentTeams,
  type NuligaMatchInfo,
} from "@/lib/nuliga-opponents";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ImportedOpponent = {
  id: string;
  name: string;
  address: string | null;
  street: string | null;
  zip: string | null;
  city: string | null;
};

const PAGE_SIZE = 1000;
export const OPPONENT_BACKFILL_SETTING = "nuliga_opponents_backfill_v1";

export function deterministicOpponentId(
  normalizedName: string,
  attempt: number,
): string {
  const hex = createHash("sha256")
    .update(`tsg08-nuliga-opponent:${normalizedName}:${attempt}`)
    .digest("hex")
    .slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

async function loadImportedOpponents(
  supabase: SupabaseServerClient,
): Promise<{ rows: ImportedOpponent[]; failed: boolean }> {
  const rows: ImportedOpponent[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("opponents")
      .select("id,name,address,street,zip,city")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);
    if (error) return { rows, failed: true };

    const page = (data ?? []) as ImportedOpponent[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, failed: false };
  }
}

export type ImportedOpponentLink = {
  opponent_id: string | null;
  opponent_team_no: number | null;
  home_away: "heim" | "auswaerts";
};

export type ImportedOpponentSyncResult = {
  links: (ImportedOpponentLink | null)[];
  opponentsFound: number;
  opponentsCreated: number;
  addressesAdded: number;
  unrecognized: number;
  hadErrors: boolean;
  retryableErrors: boolean;
};

/**
 * Legt Gegner aus bereits ausgewerteten nuLiga-Begegnungen an und ergänzt
 * ausschließlich noch leere Adressfelder bestehender Gegner.
 */
export async function syncImportedOpponents(
  supabase: SupabaseServerClient,
  parsedMatches: (NuligaMatchInfo | null)[],
  fixedOpponentIds: (string | null | undefined)[] = [],
): Promise<ImportedOpponentSyncResult> {
  const loadedOpponents = await loadImportedOpponents(supabase);

  const matches = resolveNuligaOpponentTeams(parsedMatches);
  const links: (ImportedOpponentLink | null)[] = matches.map((match) =>
    match
      ? {
          opponent_id: null,
          opponent_team_no: null,
          home_away: match.homeAway,
        }
      : null,
  );
  let unrecognized = matches.filter((match) => !match).length;

  if (loadedOpponents.failed) {
    return {
      links,
      opponentsFound: 0,
      opponentsCreated: 0,
      addressesAdded: 0,
      unrecognized,
      hadErrors: true,
      retryableErrors: true,
    };
  }

  const opponentsByName = new Map<string, ImportedOpponent>();
  const opponentsById = new Map<string, ImportedOpponent>();
  const duplicateKeys = new Set<string>();
  for (const row of loadedOpponents.rows) {
    opponentsById.set(row.id, row);
    const key = normalizeOpponentName(row.name);
    if (!key) continue;
    if (opponentsByName.has(key)) duplicateKeys.add(key);
    else opponentsByName.set(key, row);
  }

  let opponentsCreated = 0;
  let addressesAdded = 0;
  let hadErrors = false;
  let retryableErrors = false;

  // Eine bereits manuell gesetzte Termin-Verknüpfung ist verbindlich. Sie
  // dient zusätzlich als Alias, wenn der gepflegte Name vom nuLiga-Namen
  // abweicht und noch kein eindeutiger Gegner mit diesem Namen existiert.
  const fixedOpponentsByKey = new Map<string, ImportedOpponent>();
  const conflictingFixedKeys = new Set<string>();
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const fixedId = fixedOpponentIds[index];
    if (!match || !fixedId) continue;
    const fixedOpponent = opponentsById.get(fixedId);
    if (!fixedOpponent) continue;
    const key = normalizeOpponentName(match.opponentName);
    const rawKey = normalizeOpponentName(match.rawOpponentName);
    const fixedNameKey = normalizeOpponentName(fixedOpponent.name);
    const isLegacyTeamRecord =
      match.opponentTeamNo > 1 &&
      rawKey !== key &&
      fixedNameKey === rawKey;
    if (isLegacyTeamRecord) continue;
    const existing = fixedOpponentsByKey.get(key);
    if (existing && existing.id !== fixedOpponent.id) {
      fixedOpponentsByKey.delete(key);
      conflictingFixedKeys.add(key);
    } else if (!conflictingFixedKeys.has(key)) {
      fixedOpponentsByKey.set(key, fixedOpponent);
    }
  }

  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    if (!match) continue;
    const key = normalizeOpponentName(match.opponentName);
    const fixedOpponentId = fixedOpponentIds[index] ?? null;
    const namedOpponent = duplicateKeys.has(key)
      ? undefined
      : opponentsByName.get(key);
    const fixedAlias = fixedOpponentsByKey.get(key);
    if (
      !key ||
      (!fixedOpponentId &&
        !namedOpponent &&
        (!fixedAlias &&
          (duplicateKeys.has(key) || conflictingFixedKeys.has(key))))
    ) {
      unrecognized++;
      hadErrors = true;
      continue;
    }
    let opponent = fixedOpponentId
      ? opponentsById.get(fixedOpponentId)
      : namedOpponent ?? fixedAlias;
    let linkedTeamNo = match.opponentTeamNo;
    if (fixedOpponentId && !opponent) {
      // Niemals ersatzweise einen neuen Gegner erzeugen, wenn der Termin
      // bereits bewusst mit einem vorhandenen Datensatz verknüpft war.
      links[index] = {
        opponent_id: fixedOpponentId,
        opponent_team_no: linkedTeamNo,
        home_away: match.homeAway,
      };
      unrecognized++;
      hadErrors = true;
      retryableErrors = true;
      continue;
    }
    if (
      fixedOpponentId &&
      opponent &&
      match.opponentTeamNo > 1 &&
      normalizeOpponentName(match.rawOpponentName) !== key &&
      normalizeOpponentName(opponent.name) ===
        normalizeOpponentName(match.rawOpponentName)
    ) {
      // Bei alten Datensätzen steckt die Mannschaftsnummer bereits im Namen.
      linkedTeamNo = 1;
    }
    if (!fixedOpponentId && !opponent && match.opponentTeamNo > 1) {
      const legacyKey = normalizeOpponentName(match.rawOpponentName);
      if (duplicateKeys.has(legacyKey)) {
        unrecognized++;
        hadErrors = true;
        continue;
      }
      // Ältere Einträge wurden teils samt Mannschaftssuffix angelegt.
      // Diese weiterverwenden; die Nummer steckt dann bereits im Namen.
      opponent = opponentsByName.get(legacyKey);
      if (opponent) linkedTeamNo = 1;
    }

    if (!fixedOpponentId && !opponent) {
      const address = match.opponentAddress;
      for (let attempt = 0; attempt < 8 && !opponent; attempt++) {
        const deterministicId = deterministicOpponentId(key, attempt);
        const { data: created, error } = await supabase
          .from("opponents")
          .insert({
            id: deterministicId,
            name: match.opponentName,
            address: address?.address ?? "",
            street: address?.street ?? "",
            zip: address?.zip ?? "",
            city: address?.city ?? "",
            notes: "",
          })
          .select("id,name,address,street,zip,city")
          .single();
        if (!error && created) {
          opponent = created as ImportedOpponent;
          opponentsCreated++;
          if (address) addressesAdded++;
          break;
        }
        if (error?.code !== "23505") {
          hadErrors = true;
          retryableErrors = true;
          break;
        }

        // Parallele Importe verwenden dieselbe deterministische ID. Wenn der
        // andere Lauf schneller war, dessen gerade angelegten Datensatz nutzen.
        const { data: concurrent, error: concurrentError } = await supabase
          .from("opponents")
          .select("id,name,address,street,zip,city")
          .eq("id", deterministicId)
          .maybeSingle();
        if (concurrentError) {
          hadErrors = true;
          retryableErrors = true;
          break;
        }
        if (
          concurrent &&
          normalizeOpponentName(concurrent.name as string) === key
        ) {
          opponent = concurrent as ImportedOpponent;
        }
      }
      if (!opponent) {
        hadErrors = true;
        continue;
      }
      opponentsByName.set(key, opponent);
    }
    if (!opponent) {
      hadErrors = true;
      retryableErrors = true;
      continue;
    }

    if (match.opponentAddress) {
      const addressFields = ["street", "zip", "city", "address"] as const;
      let addressChanged = false;

      for (const field of addressFields) {
        const expected = opponent[field];
        const value = match.opponentAddress[field];
        if (expected?.trim() || !value) continue;

        const updateQuery = supabase
          .from("opponents")
          .update({ [field]: value })
          .eq("id", opponent.id)
          .eq("name", opponent.name);
        const conditionalUpdate =
          expected == null
            ? updateQuery.is(field, null)
            : updateQuery.eq(field, expected);
        const { data: updated, error } = await conditionalUpdate
          .select("id,name,address,street,zip,city")
          .maybeSingle();
        if (error) {
          hadErrors = true;
          retryableErrors = true;
        } else if (updated) {
          opponent = updated as ImportedOpponent;
          opponentsById.set(opponent.id, opponent);
          const actualNameKey = normalizeOpponentName(opponent.name);
          if (!duplicateKeys.has(actualNameKey)) {
            opponentsByName.set(actualNameKey, opponent);
          }
          if (fixedAlias?.id === opponent.id) {
            fixedOpponentsByKey.set(key, opponent);
          }
          addressChanged = true;
        }
      }

      if (addressChanged) addressesAdded++;
    }

    links[index] = {
      opponent_id: opponent.id,
      opponent_team_no: linkedTeamNo,
      home_away: match.homeAway,
    };
  }

  const opponentsFound = new Set(
    links.map((link) => link?.opponent_id).filter(Boolean),
  ).size;
  return {
    links,
    opponentsFound,
    opponentsCreated,
    addressesAdded,
    unrecognized,
    hadErrors,
    retryableErrors,
  };
}
