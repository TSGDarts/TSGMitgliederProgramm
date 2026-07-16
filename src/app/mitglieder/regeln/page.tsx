import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getRegelnText, REGELN_STANDARD } from "@/lib/settings";
import { saveRegeln } from "./actions";
import { Einklappbar } from "@/components/Einklappbar";
import { PageHeader, Card, CardBody, Button } from "@/components/ui";

export const metadata: Metadata = { title: "Regeln" };

// Regelwerk-Text in Abschnitte zerlegen: „# “ beginnt eine Überschrift,
// „- “ eine Regel, alles andere wird ein normaler Absatz.
interface Abschnitt {
  titel: string | null;
  zeilen: { art: "regel" | "absatz"; text: string }[];
}

function parseRegeln(text: string): Abschnitt[] {
  const abschnitte: Abschnitt[] = [];
  let aktuell: Abschnitt | null = null;
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.trim();
    if (!zeile) continue;
    if (zeile.startsWith("# ")) {
      aktuell = { titel: zeile.slice(2).trim(), zeilen: [] };
      abschnitte.push(aktuell);
      continue;
    }
    if (!aktuell) {
      aktuell = { titel: null, zeilen: [] };
      abschnitte.push(aktuell);
    }
    if (/^[-•]\s+/.test(zeile)) {
      aktuell.zeilen.push({ art: "regel", text: zeile.replace(/^[-•]\s+/, "") });
    } else {
      aktuell.zeilen.push({ art: "absatz", text: zeile });
    }
  }
  return abschnitte;
}

export default async function RegelnPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; gespeichert?: string }>;
}) {
  const profile = await requireProfile();
  const { fehler, gespeichert } = await searchParams;

  const text = await getRegelnText();
  const abschnitte = parseRegeln(text);
  const istStandard = text === REGELN_STANDARD;

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="📜 Regeln"
        subtitle="So läuft es bei uns – Verhalten, Termine, Heimspiele & Co."
      />

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody>
            <p className="font-semibold text-danger">⚠️ Fehler beim Speichern</p>
            <p className="mt-1 text-sm">{fehler}</p>
          </CardBody>
        </Card>
      ) : null}

      {gespeichert ? (
        <Card className="border-ok/40 bg-ok/10">
          <CardBody className="font-semibold text-ok">✓ Gespeichert.</CardBody>
        </Card>
      ) : null}

      {abschnitte.map((a, i) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            {a.titel && <h2 className="font-semibold">{a.titel}</h2>}
            <ul className="space-y-2">
              {a.zeilen.map((z, j) =>
                z.art === "regel" ? (
                  <li key={j} className="flex gap-2 text-sm">
                    <span aria-hidden className="shrink-0 text-primary">
                      🎯
                    </span>
                    <span>{z.text}</span>
                  </li>
                ) : (
                  <li key={j} className="text-sm text-muted">
                    {z.text}
                  </li>
                ),
              )}
            </ul>
          </CardBody>
        </Card>
      ))}

      {profile.role === "admin" && (
        <Einklappbar
          id="regeln-bearbeiten"
          title="✏️ Regeln bearbeiten (nur Admins)"
          defaultOpen={false}
          zuklappBei={gespeichert}
        >
          <form action={saveRegeln} className="space-y-3">
            <p className="text-xs text-muted">
              Aufbau: Zeilen mit <strong># </strong> werden Überschriften
              (Emoji davor erlaubt), Zeilen mit <strong>- </strong> werden
              Regeln, alles andere normale Absätze.{" "}
              {istStandard
                ? "Aktuell werden die Standard-Regeln angezeigt."
                : "Leer speichern stellt die Standard-Regeln wieder her."}
            </p>
            <textarea
              name="text"
              rows={20}
              defaultValue={text}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <Button type="submit">Speichern</Button>
          </form>
        </Einklappbar>
      )}
    </div>
  );
}
