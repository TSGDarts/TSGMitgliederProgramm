import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createSeason, nachtrageArchivSaison } from "./actions";
import { Einklappbar } from "@/components/Einklappbar";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  inputClass,
  Badge,
  EmptyState,
} from "@/components/ui";
import type { Season } from "@/lib/season";

export const metadata: Metadata = { title: "Saisonplanung" };

export default async function AdminSeasonsPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  await requireAdmin();
  const { fehler } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase
    .from("seasons")
    .select("*")
    .order("created_at", { ascending: false });
  const seasons = (data as Season[]) ?? [];

  const active = seasons.filter((s) => s.status === "active");
  const archived = seasons.filter((s) => s.status === "archived");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Saisonplanung"
        subtitle="Saisons anlegen, Saisonabfrage durchführen, Teams planen und archivieren"
      />

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody>
            <p className="font-semibold text-danger">⚠️ Fehler</p>
            <p className="mt-1 text-sm">{fehler}</p>
          </CardBody>
        </Card>
      ) : null}

      <Einklappbar id="saisons-neu" title="➕ Neue Saison anlegen">
        <form action={createSeason} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" hint="z. B. Saison 2026/27">
              <input name="name" required className={inputClass} />
            </Field>
            <Field label="Beginn (optional)">
              <input name="starts_on" type="date" className={inputClass} />
            </Field>
            <Field label="Ende (optional)">
              <input name="ends_on" type="date" className={inputClass} />
            </Field>
          </div>
          <Button type="submit">Saison anlegen</Button>
        </form>
      </Einklappbar>

      <Einklappbar
        id="saisons-nachtragen"
        title="🗂 Vergangene Saison nachtragen"
        defaultOpen={false}
      >
        <form action={nachtrageArchivSaison} className="space-y-4">
          <p className="text-sm text-muted">
            Legt die Saison <strong>direkt als Archiv-Saison</strong> an –
            mit einem Schnappschuss der <strong>aktuellen</strong>{" "}
            Mannschaften (Kader, Kapitäne/Vize) und der
            Spieltags-Statistik aus den Terminen im angegebenen Zeitraum.
            Die aktive Saison, die Mannschaften und die laufende Planung
            werden dabei <strong>nicht</strong> verändert.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name">
              <input
                name="name"
                required
                defaultValue="Saison 2025/26"
                className={inputClass}
              />
            </Field>
            <Field
              label="Beginn"
              hint="Statistik zählt nur Termine ab diesem Tag"
            >
              <input
                name="starts_on"
                type="date"
                defaultValue="2025-09-01"
                className={inputClass}
              />
            </Field>
            <Field
              label="Ende"
              hint="… bis zu diesem Tag (danach zählt die neue Saison)"
            >
              <input
                name="ends_on"
                type="date"
                defaultValue="2026-06-30"
                className={inputClass}
              />
            </Field>
          </div>
          <Button type="submit">Als Archiv-Saison anlegen</Button>
        </form>
      </Einklappbar>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Aktuelle Saisons</h2>
        {active.length === 0 ? (
          <EmptyState
            title="Keine aktive Saison"
            hint="Lege oben die neue Saison an – dort startest du dann die Saisonabfrage."
          />
        ) : (
          active.map((s) => (
            <Link key={s.id} href={`/mitglieder/admin/saisons/${s.id}`}>
              <Card className="transition hover:border-primary">
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-medium">{s.name}</span>
                    {(s.starts_on || s.ends_on) && (
                      <p className="text-sm text-muted">
                        {s.starts_on ?? "…"} bis {s.ends_on ?? "…"}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.survey_open && <Badge tone="ok">Abfrage läuft</Badge>}
                    <span className="text-sm text-primary">Planen →</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))
        )}
      </section>

      {archived.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-muted">Archiv</h2>
          {archived.map((s) => (
            <Link key={s.id} href={`/mitglieder/admin/saisons/${s.id}`}>
              <Card className="opacity-80 transition hover:border-primary">
                <CardBody className="flex items-center justify-between gap-3">
                  <span className="font-medium">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <Badge>archiviert</Badge>
                    <span className="text-sm text-primary">Ansehen →</span>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}
