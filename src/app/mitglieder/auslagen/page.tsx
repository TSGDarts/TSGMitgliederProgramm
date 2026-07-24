import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { Einklappbar } from "@/components/Einklappbar";
import { AuslageForm } from "@/components/AuslageForm";
import { KasseDateiLink } from "@/components/KasseDateiLink";
import { ziehAuslageZurueck } from "@/app/mitglieder/kasse/actions";
import { PageHeader, Card, CardBody, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Auslagen & Erstattung" };

const euro = (n: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(n);

const STATUS: Record<string, { label: string; tone: "ok" | "danger" | "warn" | "primary" }> = {
  eingereicht: { label: "⏳ eingereicht", tone: "warn" },
  genehmigt: { label: "✅ genehmigt", tone: "ok" },
  ausgezahlt: { label: "💶 ausgezahlt", tone: "primary" },
  abgelehnt: { label: "❌ abgelehnt", tone: "danger" },
};

interface AuslageRow {
  id: string;
  titel: string;
  betrag: number | null;
  datum: string | null;
  zweck: string;
  iban: string;
  file_path: string;
  status: string;
  bearbeiter_note: string;
  created_at: string;
}

export default async function AuslagenPage() {
  const profile = await requireProfile();
  const admin = createAdminSupabase();
  let meine: AuslageRow[] = [];
  try {
    const { data } = await admin
      .from("kasse_auslage")
      .select("*")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false });
    meine = (data as AuslageRow[]) ?? [];
  } catch {
    // Tabelle fehlt noch – Formular funktioniert erst nach dem SQL-Skript
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="🧾 Auslagen & Erstattung"
        subtitle="Beleg fotografieren, Betrag eintragen, einreichen – der Kassierer erstattet dir die Auslage."
      />

      <Einklappbar id="auslage-neu" title="➕ Auslage einreichen" defaultOpen>
        <AuslageForm />
      </Einklappbar>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">
          Meine Anträge{" "}
          <span className="text-sm font-normal text-muted">({meine.length})</span>
        </h2>
        {meine.length === 0 ? (
          <EmptyState
            title="Noch keine Auslagen eingereicht"
            hint="Sobald du oben etwas einreichst, siehst du hier den Status."
          />
        ) : (
          <div className="space-y-2">
            {meine.map((a) => {
              const st = STATUS[a.status] ?? STATUS.eingereicht;
              return (
                <Card key={a.id}>
                  <CardBody className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {a.titel}{" "}
                        <span className="text-muted">· {euro(a.betrag)}</span>
                      </span>
                      <Badge tone={st.tone}>{st.label}</Badge>
                    </div>
                    <p className="text-sm text-muted">
                      {a.datum ? `Beleg vom ${formatDate(a.datum)} · ` : ""}
                      eingereicht {formatDate(a.created_at)}
                      {a.iban ? ` · IBAN ${a.iban}` : ""}
                    </p>
                    {a.zweck && <p className="text-sm">{a.zweck}</p>}
                    {a.bearbeiter_note && (
                      <p className="text-sm italic text-muted">
                        Kassierer: {a.bearbeiter_note}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 pt-1">
                      {a.file_path && (
                        <KasseDateiLink wert={a.id} quelle="auslage" />
                      )}
                      {a.status === "eingereicht" && (
                        <form action={ziehAuslageZurueck}>
                          <input type="hidden" name="id" value={a.id} />
                          <button className="text-sm text-danger hover:underline">
                            Zurückziehen
                          </button>
                        </form>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
