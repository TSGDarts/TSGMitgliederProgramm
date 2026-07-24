import type { Metadata } from "next";
import { requireTreasurer } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { Einklappbar } from "@/components/Einklappbar";
import { BelegForm } from "@/components/BelegForm";
import { KasseBatchUpload } from "@/components/KasseBatchUpload";
import { KasseDateiLink } from "@/components/KasseDateiLink";
import { deleteBeleg } from "@/app/mitglieder/kasse/actions";
import { PageHeader, Card, CardBody, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Rechnungen" };

const euro = (n: number | null) =>
  n == null
    ? ""
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(n);

interface Beleg {
  id: string;
  titel: string;
  empfaenger: string;
  betrag: number | null;
  datum: string | null;
  kategorie: string;
  file_path: string;
  note: string;
}

export default async function RechnungenPage() {
  await requireTreasurer();
  const admin = createAdminSupabase();

  let belege: Beleg[] = [];
  try {
    const { data } = await admin
      .from("kasse_beleg")
      .select("*")
      .order("datum", { ascending: false, nullsFirst: false });
    belege = (data as Beleg[]) ?? [];
  } catch {
    // Tabelle fehlt noch – erst nach ALLE_ERWEITERUNGEN.sql verfügbar
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="📎 Rechnungen"
        subtitle="Rechnungen und Belege (3k, BDV, Spized …) ablegen und ansehen – nur für Kassierer und Admins."
      />

      <Einklappbar id="rechnung-neu" title="➕ Rechnung ablegen" defaultOpen={belege.length === 0}>
        <BelegForm />
      </Einklappbar>

      <Einklappbar
        id="rechnung-mehrere"
        title="📚 Mehrere Rechnungen auf einmal hochladen"
      >
        <KasseBatchUpload />
      </Einklappbar>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          Abgelegte Rechnungen{" "}
          <span className="text-sm font-normal text-muted">({belege.length})</span>
        </h2>
        {belege.length === 0 ? (
          <EmptyState
            title="Noch keine Rechnungen abgelegt"
            hint="Lade oben die erste Rechnung hoch (Bild oder PDF)."
          />
        ) : (
          <div className="space-y-2">
            {belege.map((b) => (
              <Card key={b.id}>
                <CardBody className="space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {b.titel}
                      {b.betrag != null && (
                        <span className="text-muted"> · {euro(b.betrag)}</span>
                      )}
                    </span>
                    <form action={deleteBeleg}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="text-sm text-danger hover:underline">
                        Löschen
                      </button>
                    </form>
                  </div>
                  <p className="text-sm text-muted">
                    {[
                      b.datum ? formatDate(b.datum) : null,
                      b.empfaenger || null,
                      b.kategorie || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {b.note && <p className="text-sm">{b.note}</p>}
                  {b.file_path && (
                    <KasseDateiLink wert={b.file_path} quelle="datei" />
                  )}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
