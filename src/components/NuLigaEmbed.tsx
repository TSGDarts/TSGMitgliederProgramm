import { Card, CardBody } from "@/components/ui";

/**
 * Zeigt eine nuLiga-Seite eingebettet an. Falls nuLiga die Einbettung
 * technisch verbietet (X-Frame-Options), greift der Link darunter.
 */
export function NuLigaEmbed({
  url,
  title = "nuLiga",
}: {
  url?: string | null;
  title?: string;
}) {
  if (!url) {
    return (
      <Card className="border-dashed">
        <CardBody className="text-sm text-muted">
          Für diese Mannschaft ist noch keine nuLiga-Adresse hinterlegt. Sie kann
          im Verwaltungsbereich unter „Mannschaften verwalten“ eingetragen werden.
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <iframe
          src={url}
          title={title}
          className="h-[70vh] w-full"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
      <p className="text-sm text-muted">
        Wird die Tabelle oben nicht angezeigt, blockiert nuLiga die Einbettung.{" "}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Direkt bei nuLiga öffnen →
        </a>
      </p>
    </div>
  );
}
