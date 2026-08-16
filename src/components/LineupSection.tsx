"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveLineup,
  type LineupEintrag,
} from "@/app/mitglieder/termine/spieltag-actions";
import {
  lineupSlotsFromMode,
  type LineupModeKey,
  type LineupModeOption,
  type LineupSlot,
} from "@/lib/lineup";

export interface RosterEintrag {
  id: string;
  name: string;
  inviteId?: string;
}

type SlotGame = {
  key: string;
  label: string;
  slots: { slot: LineupSlot; index: number }[];
};

type SlotGroup = {
  key: string;
  label: string;
  games: SlotGame[];
};

function groupSlots(slots: LineupSlot[]): SlotGroup[] {
  const groups: SlotGroup[] = [];
  for (const [index, slot] of slots.entries()) {
    let group = groups.find((entry) => entry.key === slot.groupKey);
    if (!group) {
      group = { key: slot.groupKey, label: slot.groupLabel, games: [] };
      groups.push(group);
    }
    let game = group.games.find((entry) => entry.key === slot.gameKey);
    if (!game) {
      game = { key: slot.gameKey, label: slot.gameLabel, slots: [] };
      group.games.push(game);
    }
    game.slots.push({ slot, index });
  }
  return groups;
}

function initialEntriesForSlots(
  initialEntries: LineupEintrag[],
  slots: LineupSlot[],
): LineupEintrag[] {
  if (slots.length === 0) {
    return initialEntries.length > 0
      ? initialEntries
      : [
          { profile_id: null, name: "" },
          { profile_id: null, name: "" },
        ];
  }

  const slotKeys = new Set(slots.map((slot) => slot.key));
  const exact = new Map<string, { entry: LineupEintrag; index: number }>();
  for (const [index, entry] of initialEntries.entries()) {
    if (entry.slot_key && slotKeys.has(entry.slot_key)) {
      exact.set(entry.slot_key, { entry, index });
    }
  }
  const used = new Set(Array.from(exact.values(), (item) => item.index));

  return slots.map((slot) => {
    const match = exact.get(slot.key)?.entry;
    if (match) return { ...match, slot_key: slot.key };

    const fallbackIndex = initialEntries.findIndex(
      (entry, index) => !used.has(index) && entry.name.trim(),
    );
    if (fallbackIndex >= 0) {
      used.add(fallbackIndex);
      return { ...initialEntries[fallbackIndex], slot_key: slot.key };
    }
    return { profile_id: null, name: "", slot_key: slot.key };
  });
}

function withoutSlotKeys(entries: LineupEintrag[]): LineupEintrag[] {
  return entries.map((entry) => {
    const copy = { ...entry };
    delete copy.slot_key;
    return copy;
  });
}

function rosterValue(entry: RosterEintrag): string {
  return entry.inviteId ? `invite:${entry.inviteId}` : `profile:${entry.id}`;
}

function lineupValue(entry: LineupEintrag | undefined): string {
  if (entry?.invite_id) return `invite:${entry.invite_id}`;
  if (entry?.profile_id) return `profile:${entry.profile_id}`;
  return "";
}

/**
 * Vorläufige Aufstellung: Kapitän/Vize erstellt einen privaten Entwurf und
 * veröffentlicht ihn anschließend für die Mannschaft. Bei einem lesbaren
 * Spielmodus entstehen feste Plätze für jede Einzel- und Doppelrunde.
 */
export function LineupSection({
  eventId,
  canManage,
  released,
  initialEntries,
  roster,
  kopfzeilen,
  modusOptionen,
  initialModusKey,
  initialModusSnapshot = "",
}: {
  eventId: string;
  canManage: boolean;
  released: boolean;
  initialEntries: LineupEintrag[];
  roster: RosterEintrag[];
  kopfzeilen: string[];
  modusOptionen: LineupModeOption[];
  initialModusKey: LineupModeKey | "";
  initialModusSnapshot?: string;
}) {
  const router = useRouter();
  const startModusKey =
    modusOptionen.find((option) => option.key === initialModusKey)?.key ??
    (modusOptionen.length === 1 ? modusOptionen[0].key : "");
  const startModus = initialModusSnapshot.trim()
    ? initialModusSnapshot.trim()
    : (modusOptionen.find((option) => option.key === startModusKey)?.mode ??
      "");
  const startSlots = lineupSlotsFromMode(startModus);
  const hasSavedSlots = initialEntries.some((entry) => entry.slot_key);
  const startsStructured =
    startSlots.length > 0 && (initialEntries.length === 0 || hasSavedSlots);
  const [modusKey, setModusKey] = useState<LineupModeKey | "">(
    startModusKey,
  );
  const [modusText, setModusText] = useState(startModus);
  const [strukturAktiv, setStrukturAktiv] = useState(startsStructured);
  const modus = modusText;
  const aktuellerModus =
    modusOptionen.find((option) => option.key === modusKey)?.mode ?? "";
  const slots = lineupSlotsFromMode(modus);
  const slotGroups = groupSlots(strukturAktiv ? slots : []);
  const [entries, setEntries] = useState<LineupEintrag[]>(() =>
    startsStructured
      ? initialEntriesForSlots(initialEntries, startSlots)
      : initialEntriesForSlots(withoutSlotKeys(initialEntries), []),
  );
  const [istFreigegeben, setIstFreigegeben] = useState(released);
  const [meldung, setMeldung] = useState("");
  const [kopiert, setKopiert] = useState(false);
  const [isPending, startTransition] = useTransition();

  const gefuellt = entries.filter((entry) => entry.name.trim());
  const modusFehlt = modusOptionen.length > 1 && !modusKey;
  const modusVeraltet =
    !!modusKey &&
    !!modus &&
    !!aktuellerModus &&
    aktuellerModus !== modus;

  function textErzeugen(): string {
    const zeilen = [
      ...kopfzeilen,
      ...(modus ? [`🎯 Modus: ${modus}`] : []),
      "",
    ];
    if (slotGroups.length === 0) {
      zeilen.push(
        ...gefuellt.map((entry, index) => `${index + 1}. ${entry.name}`),
      );
      return zeilen.join("\n");
    }

    for (const group of slotGroups) {
      const spiele = group.games.flatMap((game) => {
        const names = game.slots
          .map(({ index }) => entries[index]?.name.trim())
          .filter(Boolean);
        return names.length > 0
          ? [`${game.label}: ${names.join(" / ")}`]
          : [];
      });
      if (spiele.length > 0) zeilen.push(group.label, ...spiele, "");
    }
    return zeilen.join("\n").trimEnd();
  }

  async function kopieren() {
    try {
      await navigator.clipboard.writeText(textErzeugen());
      setKopiert(true);
      setTimeout(() => setKopiert(false), 2000);
    } catch {}
  }

  function spielerWaehlen(index: number, value: string) {
    const spieler = roster.find((entry) => rosterValue(entry) === value);
    setEntries((prev) =>
      prev.map((entry, entryIndex) =>
        entryIndex === index
          ? {
              ...entry,
              profile_id: spieler && !spieler.inviteId ? spieler.id : null,
              invite_id: spieler?.inviteId ?? null,
              name: spieler?.name ?? "",
            }
          : entry,
      ),
    );
  }

  function modusWaehlen(key: LineupModeKey | "") {
    const nextMode =
      modusOptionen.find((option) => option.key === key)?.mode ?? "";
    const nextSlots = lineupSlotsFromMode(nextMode);
    const gefuellteAnzahl = entries.filter((entry) => entry.name.trim()).length;
    if (nextSlots.length > 0 && gefuellteAnzahl > nextSlots.length) {
      setMeldung(
        "Der gewählte Modus hat weniger Plätze als die aktuelle Aufstellung. Bitte zuerst Einträge entfernen.",
      );
      return;
    }
    if (
      gefuellteAnzahl > 0 &&
      (key !== modusKey || nextMode !== modus) &&
      !window.confirm(
        "Beim Wechsel des Spielmodus werden die vorhandenen Zuordnungen auf die neuen Plätze übertragen. Bitte anschließend alle Positionen prüfen. Fortfahren?",
      )
    ) {
      return;
    }
    const shouldStructure =
      nextSlots.length > 0 &&
      (strukturAktiv || !entries.some((entry) => entry.name.trim()));
    setEntries((prev) => {
      if (shouldStructure) return initialEntriesForSlots(prev, nextSlots);
      return withoutSlotKeys(prev).map((entry) => {
        const copy = { ...entry };
        if (key) copy.mode_key = key;
        else delete copy.mode_key;
        return copy;
      });
    });
    setStrukturAktiv(shouldStructure);
    setModusKey(key);
    setModusText(nextMode);
    setMeldung("");
  }

  function strukturUebernehmen() {
    setEntries((prev) => initialEntriesForSlots(prev, slots));
    setStrukturAktiv(true);
  }

  function speichern(aktion: "entwurf" | "freigeben" | "zurueckziehen") {
    setMeldung("");
    const warFreigegeben = istFreigegeben;
    startTransition(async () => {
      const res = await saveLineup(
        eventId,
        entries.map((entry) => ({
          ...entry,
          ...(modusKey ? { mode_key: modusKey } : {}),
        })),
        aktion,
        modusKey,
      );
      if (!res.ok) {
        setMeldung(res.message ?? "Konnte nicht gespeichert werden.");
        return;
      }

      if (aktion === "freigeben") setIstFreigegeben(true);
      if (aktion === "entwurf" || aktion === "zurueckziehen") {
        setIstFreigegeben(false);
      }
      setMeldung(
        aktion === "zurueckziehen"
          ? "✓ Veröffentlichung zurückgezogen – die Aufstellung ist wieder ein privater Entwurf."
          : aktion === "freigeben" && warFreigegeben
            ? "✓ Veröffentlichte Aufstellung aktualisiert."
            : aktion === "freigeben"
              ? "✅ Veröffentlicht – die Mannschaft wurde benachrichtigt."
              : "✓ Entwurf gespeichert (nur für Kapitän, Vize und Verwaltung sichtbar).",
      );
      router.refresh();
    });
  }

  // Nur-Lese-Ansicht für veröffentlichte Aufstellungen.
  if (!canManage) {
    if (!istFreigegeben || gefuellt.length === 0) return null;
    return (
      <div className="space-y-3">
        {modus && (
          <p className="text-sm text-muted">
            🎯 <strong>Spielmodus:</strong> {modus}
          </p>
        )}
        {slotGroups.length === 0 ? (
          <ol className="list-inside list-decimal space-y-1 text-sm">
            {gefuellt.map((entry, index) => (
              <li key={`${entry.name}-${index}`}>{entry.name}</li>
            ))}
          </ol>
        ) : (
          slotGroups.map((group) => {
            const spiele = group.games
              .map((game) => ({
                ...game,
                names: game.slots
                  .map(({ index }) => entries[index]?.name.trim())
                  .filter(Boolean),
              }))
              .filter((game) => game.names.length > 0);
            if (spiele.length === 0) return null;
            return (
              <div key={group.key} className="space-y-1">
                <p className="text-sm font-medium">{group.label}</p>
                <ul className="space-y-1 text-sm">
                  {spiele.map((game) => (
                    <li key={game.key} className="flex gap-2">
                      <span className="min-w-20 text-muted">{game.label}:</span>
                      <span>{game.names.join(" / ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm">
          {istFreigegeben ? (
            <span className="font-medium text-ok">
              ✅ Veröffentlicht – für die Mannschaft sichtbar
            </span>
          ) : (
            <span className="font-medium text-warn">
              🔒 Entwurf – noch nicht für die Mannschaft sichtbar
            </span>
          )}
        </p>
        {modusOptionen.length > 1 ? (
          <label className="block space-y-1 pt-1 text-sm">
            <span className="font-medium">Wettbewerb / Spielmodus</span>
            <select
              value={modusKey}
              onChange={(event) =>
                modusWaehlen(event.target.value as LineupModeKey | "")
              }
              disabled={isPending}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm disabled:opacity-60"
            >
              <option value="">– Pokal-Wettbewerb wählen –</option>
              {modusOptionen.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} –{" "}
                  {option.key === modusKey && modusVeraltet
                    ? modus
                    : option.mode}
                </option>
              ))}
            </select>
          </label>
        ) : modus && slots.length > 0 ? (
          <p className="text-sm text-muted">
            🎯 <strong>Spielmodus:</strong> {modus}
          </p>
        ) : null}
        {modus && slots.length === 0 && (
          <p className="text-sm text-warn">
            ⚠️ Der hinterlegte Spielmodus „{modus}“ kann nicht automatisch in
            Einzel-/Doppelplätze aufgeteilt werden. Deshalb wird eine freie
            Spielerliste verwendet.
          </p>
        )}
        {!modus && (
          <p className="text-sm text-warn">
            ⚠️ Für diese Mannschaft ist kein Spielmodus hinterlegt. Deshalb
            wird eine freie Spielerliste verwendet.
          </p>
        )}
      </div>

      {modusVeraltet && (
          <div className="space-y-2 rounded-lg border border-warn/50 bg-warn/5 p-3 text-sm">
            <p>
              Der gespeicherte Spielmodus dieser Aufstellung unterscheidet
              sich vom aktuell in der Mannschaftspflege hinterlegten Modus.
              Die veröffentlichte Reihenfolge bleibt deshalb unverändert.
            </p>
            <button
              type="button"
              onClick={() => modusWaehlen(modusKey)}
              disabled={isPending}
              className="rounded-lg border border-warn px-3 py-1.5 font-medium text-warn hover:bg-warn/10 disabled:opacity-60"
            >
              Aktuellen Modus übernehmen
            </button>
          </div>
        )}

      {!strukturAktiv && slots.length > 0 && initialEntries.length > 0 && (
        <div className="space-y-2 rounded-lg border border-warn/50 bg-warn/5 p-3 text-sm">
          <p>
            Diese bestehende Aufstellung wurde früher als freie Spielerliste
            gespeichert. Sie bleibt unverändert, bis du sie bewusst auf die
            Einzel-/Doppelplätze des Modus übernimmst.
          </p>
          <button
            type="button"
            onClick={strukturUebernehmen}
            disabled={isPending || entries.length > slots.length}
            className="rounded-lg border border-warn px-3 py-1.5 font-medium text-warn hover:bg-warn/10 disabled:opacity-60"
          >
            Auf Modusplätze übernehmen
          </button>
          {entries.length > slots.length && (
            <p className="text-xs text-warn">
              Die alte Liste enthält mehr Einträge als der Modus Plätze hat
              und kann daher nicht automatisch übernommen werden.
            </p>
          )}
        </div>
      )}

      {slotGroups.length > 0 ? (
        <div className="space-y-3">
          {slotGroups.map((group) => (
            <fieldset
              key={group.key}
              className="rounded-lg border border-border p-3"
            >
              <legend className="px-1 text-sm font-semibold">
                {group.label}
              </legend>
              <div className="space-y-3">
                {group.games.map((game) => (
                  <div
                    key={game.key}
                    className="grid gap-2 sm:grid-cols-[6rem_1fr] sm:items-start"
                  >
                    <span className="pt-2 text-sm font-medium text-muted">
                      {game.label}
                    </span>
                    <div
                      className={
                        game.slots.length > 1
                          ? "grid gap-2 sm:grid-cols-2"
                          : "grid gap-2"
                      }
                    >
                      {game.slots.map(({ slot, index }) => (
                        <label key={slot.key} className="space-y-1">
                          {game.slots.length > 1 && (
                            <span className="text-xs text-muted">
                              {slot.playerLabel}
                            </span>
                          )}
                          <select
                            value={lineupValue(entries[index])}
                            onChange={(event) =>
                              spielerWaehlen(index, event.target.value)
                            }
                            disabled={isPending}
                            aria-label={`${group.label}, ${game.label}, ${slot.playerLabel}`}
                            className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm disabled:opacity-60"
                          >
                            <option value="">– Spieler wählen –</option>
                            {lineupValue(entries[index]) &&
                              !roster.some(
                                (entry) =>
                                  rosterValue(entry) ===
                                  lineupValue(entries[index]),
                              ) && (
                                <option value={lineupValue(entries[index])}>
                                  {entries[index]?.name} (nicht mehr im Kader)
                                </option>
                              )}
                            {roster.map((entry) => (
                              <option
                                key={rosterValue(entry)}
                                value={rosterValue(entry)}
                                disabled={game.slots.some(
                                  (other) =>
                                    other.index !== index &&
                                    lineupValue(entries[other.index]) ===
                                      rosterValue(entry),
                                )}
                              >
                                {entry.name}
                                {entry.inviteId
                                  ? " (noch nicht angemeldet)"
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-6 text-right text-sm text-muted">
                {index + 1}.
              </span>
              <select
                value={lineupValue(entry)}
                onChange={(event) => spielerWaehlen(index, event.target.value)}
                disabled={isPending}
                className="flex-1 rounded-lg border border-border bg-surface px-2 py-1.5 text-sm disabled:opacity-60"
              >
                <option value="">– Spieler wählen –</option>
                {lineupValue(entry) &&
                  !roster.some(
                    (rosterEntry) =>
                      rosterValue(rosterEntry) === lineupValue(entry),
                  ) && (
                    <option value={lineupValue(entry)}>
                      {entry.name} (nicht mehr im Kader)
                    </option>
                  )}
                {roster.map((rosterEntry) => (
                  <option
                    key={rosterValue(rosterEntry)}
                    value={rosterValue(rosterEntry)}
                  >
                    {rosterEntry.name}
                    {rosterEntry.inviteId ? " (noch nicht angemeldet)" : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  setEntries((prev) =>
                    prev.filter((_, entryIndex) => entryIndex !== index),
                  )
                }
                disabled={isPending}
                title="Zeile entfernen"
                className="rounded-lg border border-border px-2 py-1 text-sm hover:bg-border/40 disabled:opacity-60"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setEntries((prev) => [
                ...prev,
                { profile_id: null, name: "" },
              ])
            }
            disabled={isPending || entries.length >= 64}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-border/40 disabled:opacity-60"
          >
            ＋ Zeile hinzufügen
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {istFreigegeben ? (
          <>
            <button
              type="button"
              onClick={() => speichern("freigeben")}
              disabled={
                isPending ||
                modusFehlt ||
                modusVeraltet ||
                gefuellt.length === 0
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-60"
            >
              Änderungen veröffentlichen
            </button>
            <button
              type="button"
              onClick={() => speichern("zurueckziehen")}
              disabled={isPending}
              className="rounded-lg border border-warn px-4 py-2 text-sm font-medium text-warn hover:bg-warn/10 disabled:opacity-60"
            >
              Veröffentlichung zurückziehen
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => speichern("entwurf")}
              disabled={isPending || modusFehlt || modusVeraltet}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40 disabled:opacity-60"
            >
              Entwurf speichern
            </button>
            <button
              type="button"
              onClick={() => speichern("freigeben")}
              disabled={
                isPending ||
                modusFehlt ||
                modusVeraltet ||
                gefuellt.length === 0
              }
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-60"
            >
              ✅ Für die Mannschaft veröffentlichen
            </button>
          </>
        )}
        <button
          type="button"
          onClick={kopieren}
          disabled={isPending || gefuellt.length === 0}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40 disabled:opacity-60"
        >
          {kopiert ? "✓ Kopiert" : "📋 Text für WhatsApp kopieren"}
        </button>
      </div>
      {meldung && <p className="text-sm text-muted">{meldung}</p>}
    </div>
  );
}
