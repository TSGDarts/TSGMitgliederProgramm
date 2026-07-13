"use client";

import { archiveSeason } from "../actions";
import { Button } from "@/components/ui";

export function ArchiveButton({ id, name }: { id: string; name: string }) {
  return (
    <form
      action={archiveSeason}
      onSubmit={(e) => {
        if (
          !confirm(
            `Saison „${name}“ wirklich abschließen?\n\nAlle Teams werden mit Kader und Statistiken ins Archiv übernommen und die Saisonabfrage wird geschlossen.\n\nDie Teams selbst bleiben bestehen – du kannst sie danach für die neue Saison anpassen.`,
          )
        )
          e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="secondary" className="text-warn">
        Saison abschließen & archivieren
      </Button>
    </form>
  );
}
