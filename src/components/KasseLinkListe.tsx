import type { KasseLink } from "@/lib/settings";

/** Anzeige der wichtigen Kassen-Links (Kassenbuch, Getränkeliste …). */
export function KasseLinkListe({ links }: { links: KasseLink[] }) {
  if (links.length === 0) {
    return (
      <p className="text-sm text-muted">
        Noch keine Links hinterlegt – unten mit „✏️ Links bearbeiten“ eintragen.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {links.map((l) => (
        <li key={l.url}>
          <a
            href={l.url}
            target="_blank"
            rel="noreferrer"
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:border-primary"
          >
            <span className="font-medium">📊 {l.titel}</span>
            <span className="text-primary">Öffnen →</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
