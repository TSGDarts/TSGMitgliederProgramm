import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAllTeams } from "@/lib/member-queries";
import { createTeam } from "./actions";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  inputClass,
  EmptyState,
} from "@/components/ui";

export const metadata: Metadata = { title: "Mannschaften verwalten" };

export default async function AdminTeamsPage() {
  await requireAdmin();
  const teams = await getAllTeams();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mannschaften verwalten"
        subtitle="Teams anlegen, Liga & nuLiga verknüpfen, Kader pflegen"
      />

      <Card>
        <CardBody>
          <form action={createTeam} className="space-y-4">
            <h2 className="font-semibold">Neue Mannschaft</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">
                <input name="name" required className={inputClass} />
              </Field>
              <Field label="Liga (optional)">
                <input name="league" className={inputClass} />
              </Field>
            </div>
            <Field label="Beschreibung (optional)">
              <textarea name="description" rows={2} className={inputClass} />
            </Field>
            <Button type="submit">Mannschaft anlegen</Button>
          </form>
        </CardBody>
      </Card>

      <section className="space-y-3">
        {teams.length === 0 ? (
          <EmptyState title="Noch keine Mannschaften" />
        ) : (
          teams.map((t) => (
            <Link key={t.id} href={`/mitglieder/admin/mannschaften/${t.id}`}>
              <Card className="transition hover:border-primary">
                <CardBody className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{t.name}</div>
                    {t.league && (
                      <div className="text-sm text-muted">{t.league}</div>
                    )}
                  </div>
                  <span className="text-sm text-primary">Bearbeiten →</span>
                </CardBody>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
