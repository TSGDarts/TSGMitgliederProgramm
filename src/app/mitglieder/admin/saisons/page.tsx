import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createSeason } from "./actions";
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

export default async function AdminSeasonsPage() {
  await requireAdmin();
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

      <Card>
        <CardBody>
          <form action={createSeason} className="space-y-4">
            <h2 className="font-semibold">Neue Saison anlegen</h2>
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
        </CardBody>
      </Card>

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
