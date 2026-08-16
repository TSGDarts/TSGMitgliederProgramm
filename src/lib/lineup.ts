import type { EventType } from "@/lib/types";

export type LineupSlot = {
  key: string;
  groupKey: string;
  groupLabel: string;
  gameKey: string;
  gameLabel: string;
  playerLabel: string;
};

export type LineupModeKey = "liga" | "pokal" | "achter";

export type LineupModeOption = {
  key: LineupModeKey;
  label: string;
  mode: string;
};

const MAX_LINEUP_SLOTS = 64;

/**
 * Liest die in der Mannschaftspflege verwendete Schreibweise, z. B.
 * "4 Einzel – 2 Doppel – 4 Einzel – 2 Doppel", und erzeugt daraus
 * feste Aufstellungsplaetze. Unbekannter Freitext liefert bewusst keine
 * Plaetze; die UI faellt dann auf die freie Spielerliste zurueck.
 */
export function lineupSlotsFromMode(mode: string): LineupSlot[] {
  const parts = Array.from(
    mode.matchAll(/(\d{1,2})\s*(?:x\s*)?(einzel|doppel)(?:spiele?)?\b/gi),
  );
  const roundCount = { einzel: 0, doppel: 0 };
  const slots: LineupSlot[] = [];

  for (const [partIndex, part] of parts.entries()) {
    const gameCount = Math.min(16, Math.max(0, Number(part[1])));
    const kind = part[2].toLocaleLowerCase("de-DE") as
      | "einzel"
      | "doppel";
    if (!gameCount) continue;

    roundCount[kind] += 1;
    const roundNo = roundCount[kind];
    const kindLabel = kind === "einzel" ? "Einzel" : "Doppel";
    const groupKey = `${partIndex}-${kind}`;
    const groupLabel = `${roundNo}. ${kindLabel}runde · ${gameCount} ${kindLabel}`;
    const playersPerGame = kind === "doppel" ? 2 : 1;

    for (let gameIndex = 0; gameIndex < gameCount; gameIndex += 1) {
      for (
        let playerIndex = 0;
        playerIndex < playersPerGame;
        playerIndex += 1
      ) {
        if (slots.length >= MAX_LINEUP_SLOTS) return slots;
        slots.push({
          key: `${groupKey}-${gameIndex}-${playerIndex}`,
          groupKey,
          groupLabel,
          gameKey: `${groupKey}-${gameIndex}`,
          gameLabel: `${kindLabel} ${gameIndex + 1}`,
          playerLabel:
            kind === "doppel" ? `Spieler ${playerIndex + 1}` : "Spieler",
        });
      }
    }
  }

  return slots;
}

/** Liefert die für diesen Spieltag erlaubten, gepflegten Spielmodi. */
export function lineupModeOptionsForEvent(
  event: { type: EventType; title: string },
  teamMode: string | null | undefined,
  modes: { liga: string; pokal: string; achter: string },
): LineupModeOption[] {
  if (event.type === "pokal") {
    const options: LineupModeOption[] = [];
    if (modes.pokal.trim()) {
      options.push({
        key: "pokal",
        label: "Klaus-Unterberg-Pokal",
        mode: modes.pokal.trim(),
      });
    }
    if (modes.achter.trim()) {
      options.push({
        key: "achter",
        label: "8ter Cup (BDV)",
        mode: modes.achter.trim(),
      });
    }
    return options;
  }

  if (event.type === "match" || event.type === "friendly") {
    const mode = teamMode?.trim() || modes.liga.trim();
    return mode ? [{ key: "liga", label: "Mannschaftsmodus", mode }] : [];
  }

  return [];
}

/**
 * Waehlt den gespeicherten Modus; nur bei alten Pokal-Aufstellungen ohne
 * Auswahl dient der Titel noch als einmaliger Startwert für die UI.
 */
export function lineupModeKeyForEvent(
  event: { type: EventType; title: string },
  options: LineupModeOption[],
  savedKey?: string | null,
  inferLegacyFromTitle = false,
): LineupModeKey | "" {
  const saved = options.find((option) => option.key === savedKey);
  if (saved) return saved.key;
  if (event.type === "pokal" && inferLegacyFromTitle) {
    const istAchter = /(?:\b8(?:er|ter)\b|achter|bdv)/i.test(event.title);
    const inferred = options.find((option) =>
      istAchter ? option.key === "achter" : option.key === "pokal",
    );
    if (inferred) return inferred.key;
  }
  return options.length === 1 ? options[0].key : "";
}
