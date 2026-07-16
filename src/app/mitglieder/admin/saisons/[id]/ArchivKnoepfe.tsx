"use client";

import { deleteSeason, deleteArchivTeam } from "../actions";
import { Button } from "@/components/ui";

/** Ganze Saison löschen – mit Sicherheitsabfrage. */
export function SaisonLoeschenKnopf({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={deleteSeason}
      onSubmit={(e) => {
        if (
          !confirm(
            `Saison „${name}“ wirklich KOMPLETT löschen?\n\nAlle Archiv-Einträge, Abfrage-Antworten, Pokal-Kader und Planungs-Entwürfe dieser Saison werden mit gelöscht. Das kann nicht rückgängig gemacht werden.`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" className="text-danger">
        🗑 Saison löschen
      </Button>
    </form>
  );
}

/** Einzelnen Archiv-Eintrag (Team) löschen – mit Sicherheitsabfrage. */
export function ArchivEintragLoeschenKnopf({
  id,
  seasonId,
  name,
}: {
  id: string;
  seasonId: string;
  name: string;
}) {
  return (
    <form
      action={deleteArchivTeam}
      onSubmit={(e) => {
        if (!confirm(`Eintrag „${name}“ aus dem Archiv löschen?`))
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="season_id" value={seasonId} />
      <button
        type="submit"
        className="text-sm text-danger hover:underline"
      >
        Eintrag löschen
      </button>
    </form>
  );
}
