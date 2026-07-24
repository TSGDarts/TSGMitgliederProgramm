import type { Metadata } from "next";
import { requireTreasurer } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { Einklappbar } from "@/components/Einklappbar";
import { ImportForm } from "@/components/ImportForm";
import { BelegForm } from "@/components/BelegForm";
import { AuslageEntscheidung } from "@/components/AuslageEntscheidung";
import { KasseDateiLink } from "@/components/KasseDateiLink";
import { deleteImport, deleteBeleg } from "./actions";
import { PageHeader, Card, CardBody, Badge, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Kasse" };

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

export default async function KassePage() {
  await requireTreasurer();
  const admin = createAdminSupabase();

  // Alles parallel laden
  const [importsRes, buchungenRes, belegeRes, auslagenRes, profileRes] =
    await Promise.all([
      admin
        .from("kasse_import")
        .select("*")
        .order("created_at", { ascending: false }),
      admin.from("kasse_import").select("id").eq("is_current", true).maybeSingle(),
      admin
        .from("kasse_beleg")
        .select("*")
        .order("datum", { ascending: false, nullsFirst: false }),
      admin
        .from("kasse_auslage")
        .select("*")
        .order("created_at", { ascending: false }),
      admin.from("profiles").select("id, full_name"),
    ]);

  const imports = (importsRes.data ?? []) as Array<{
    id: string;
    stichtag: string | null;
    dateiname: string;
    file_path: string;
    einnahmen: number | null;
    ausgaben: number | null;
    saldo: number | null;
    is_current: boolean;
    created_at: string;
  }>;
  const aktuell = imports.find((i) => i.is_current) ?? imports[0] ?? null;

  const currentId = (buchungenRes.data as { id: string } | null)?.id ?? aktuell?.id;
  let buchungen: Array<{
    id: string;
    datum: string | null;
    empfaenger: string;
    betrag: number | null;
    zweck: string;
  }> = [];
  if (currentId) {
    const { data } = await admin
      .from("kasse_buchung")
      .select("id, datum, empfaenger, betrag, zweck")
      .eq("import_id", currentId)
      .order("datum", { ascending: false, nullsFirst: false });
    buchungen = data ?? [];
  }

  const belege = (belegeRes.data ?? []) as Array<{
    id: string;
    titel: string;
    empfaenger: string;
    betrag: number | null;
    datum: string | null;
    kategorie: string;
    file_path: string;
    note: string;
  }>;

  const namen = new Map(
    ((profileRes.data ?? []) as { id: string; full_name: string }[]).map((p) => [
      p.id,
      p.full_name,
    ]),
  );
  const auslagen = (auslagenRes.data ?? []) as Array<{
    id: string;
    profile_id: string;
    titel: string;
    betrag: number | null;
    datum: string | null;
    zweck: string;
    iban: string;
    file_path: string;
    status: string;
    bearbeiter_note: string;
    created_at: string;
  }>;
  const offen = auslagen.filter((a) => a.status === "eingereicht");
  const erledigt = auslagen.filter((a) => a.status !== "eingereicht");

  return (
    <div className="space-y-6">
      <PageHeader
        title="💰 Kasse"
        subtitle="Kontostand, Belege und Auszahlungen – nur für Kassierer und Admins sichtbar."
      />

      {/* Aktueller Kontostand */}
      {aktuell ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-primary/40 bg-primary/5">
            <CardBody>
              <p className="text-xs text-muted">Aktueller Kontostand</p>
              <p className="text-2xl font-bold">{euro(aktuell.saldo)}</p>
              <p className="text-xs text-muted">
                Stand {aktuell.stichtag ? formatDate(aktuell.stichtag) : "?"}
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs text-muted">Einnahmen (gesamt)</p>
              <p className="text-2xl font-bold text-ok">{euro(aktuell.einnahmen)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-xs text-muted">Ausgaben (gesamt)</p>
              <p className="text-2xl font-bold text-danger">
                {euro(aktuell.ausgaben)}
              </p>
            </CardBody>
          </Card>
        </div>
      ) : (
        <EmptyState
          title="Noch kein Kontostand eingelesen"
          hint="Lade unten die aktuelle Excel-Auswertung vom Hauptverein hoch."
        />
      )}

      {/* Offene Auszahlungsanträge (zuerst – Handlungsbedarf) */}
      <Einklappbar
        id="kasse-offene-auslagen"
        title={`🧾 Offene Auszahlungsanträge (${offen.length})`}
        defaultOpen={offen.length > 0}
      >
        {offen.length === 0 ? (
          <p className="text-sm text-muted">Keine offenen Anträge. 👍</p>
        ) : (
          <div className="space-y-3">
            {offen.map((a) => (
              <Card key={a.id}>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {a.titel} <span className="text-muted">· {euro(a.betrag)}</span>
                    </span>
                    <span className="text-sm text-muted">
                      {namen.get(a.profile_id) ?? "?"}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {a.datum ? `Beleg vom ${formatDate(a.datum)} · ` : ""}
                    eingereicht {formatDate(a.created_at)}
                    {a.iban ? ` · IBAN ${a.iban}` : ""}
                  </p>
                  {a.zweck && <p className="text-sm">{a.zweck}</p>}
                  {a.file_path && <KasseDateiLink wert={a.id} quelle="auslage" />}
                  <AuslageEntscheidung id={a.id} status={a.status} />
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </Einklappbar>

      {/* Monatliche Auswertung einlesen */}
      <Einklappbar id="kasse-import" title="📥 Kontostand einlesen (Excel vom Hauptverein)">
        <div className="space-y-4">
          <ImportForm />
          {imports.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium">Bisherige Auswertungen</p>
              {imports.map((imp) => (
                <div
                  key={imp.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-1.5 text-sm"
                >
                  <span>
                    {imp.stichtag ? formatDate(imp.stichtag) : "?"} ·{" "}
                    <strong>{euro(imp.saldo)}</strong>
                    {imp.is_current && (
                      <>
                        {" "}
                        <Badge tone="primary">aktuell</Badge>
                      </>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    {imp.file_path && (
                      <KasseDateiLink
                        wert={imp.file_path}
                        quelle="datei"
                        label="📎 Datei"
                      />
                    )}
                    <form action={deleteImport}>
                      <input type="hidden" name="id" value={imp.id} />
                      <button className="text-danger hover:underline">Löschen</button>
                    </form>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Einklappbar>

      {/* Buchungen der aktuellen Auswertung */}
      <Einklappbar
        id="kasse-buchungen"
        title={`📒 Buchungen (${buchungen.length})`}
      >
        {buchungen.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Buchungen eingelesen.</p>
        ) : (
          <div className="max-h-[32rem] space-y-1 overflow-y-auto">
            {buchungen.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-start justify-between gap-2 border-b border-border/50 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-muted">
                    {b.datum ? formatDate(b.datum) : "?"}
                  </span>{" "}
                  {b.empfaenger}
                  {b.zweck && (
                    <span className="block text-xs text-muted">{b.zweck}</span>
                  )}
                </span>
                <span
                  className={`font-medium ${
                    (b.betrag ?? 0) < 0 ? "text-danger" : "text-ok"
                  }`}
                >
                  {euro(b.betrag)}
                </span>
              </div>
            ))}
          </div>
        )}
      </Einklappbar>

      {/* Belege/Rechnungen ablegen */}
      <Einklappbar id="kasse-belege" title={`📎 Belege & Rechnungen (${belege.length})`}>
        <div className="space-y-4">
          <Einklappbar id="kasse-beleg-neu" title="➕ Beleg ablegen">
            <BelegForm />
          </Einklappbar>
          {belege.length > 0 && (
            <div className="space-y-2">
              {belege.map((b) => (
                <Card key={b.id}>
                  <CardBody className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {b.titel}{" "}
                        {b.betrag != null && (
                          <span className="text-muted">· {euro(b.betrag)}</span>
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
        </div>
      </Einklappbar>

      {/* Erledigte Auszahlungen */}
      {erledigt.length > 0 && (
        <Einklappbar
          id="kasse-erledigte-auslagen"
          title={`✔️ Erledigte Anträge (${erledigt.length})`}
        >
          <div className="space-y-2">
            {erledigt.map((a) => {
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
                      {namen.get(a.profile_id) ?? "?"}
                      {a.iban ? ` · IBAN ${a.iban}` : ""}
                    </p>
                    {a.bearbeiter_note && (
                      <p className="text-sm italic text-muted">
                        Notiz: {a.bearbeiter_note}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-4">
                      {a.file_path && (
                        <KasseDateiLink wert={a.id} quelle="auslage" />
                      )}
                      <AuslageEntscheidung id={a.id} status={a.status} />
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </Einklappbar>
      )}
    </div>
  );
}
