import Link from "next/link";
import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { getAllTeams } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import { createQuestion } from "./actions";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  inputClass,
  EmptyState,
  Badge,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { FRAGE_ARTEN, frageArtLabel } from "@/lib/types";
import { Einklappbar } from "@/components/Einklappbar";

export const metadata: Metadata = { title: "Fragen & Feedback" };

export default async function FragenPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string }>;
}) {
  await requireProfile();
  const { fehler } = await searchParams;
  const teams = await getAllTeams();
  const supabase = await createClient();

  // kind gibt es erst nach Skript 44 – bei alten Datenbanken ohne die
  // Spalte greift die Ersatz-Abfrage (alles zählt dann als Frage).
  let data: unknown = (
    await supabase
      .from("questions")
      .select(
        "id,title,kind,created_at,team_id,author:profiles(full_name),answers(count)",
      )
      .order("created_at", { ascending: false })
  ).data;
  if (!data) {
    data = (
      await supabase
        .from("questions")
        .select(
          "id,title,created_at,team_id,author:profiles(full_name),answers(count)",
        )
        .order("created_at", { ascending: false })
    ).data;
  }

  const questions = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
    kind?: string | null;
    created_at: string;
    team_id: string | null;
    author: { full_name: string } | null;
    answers: { count: number }[];
  }>;

  const teamName = (id: string | null) =>
    id ? teams.find((t) => t.id === id)?.name : null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fragen & Feedback"
        subtitle="Stell eine Frage oder gib Feedback – Lob, Kritik, Ideen und Vorschläge sind willkommen"
      />

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody>
            <p className="font-semibold text-danger">⚠️ Fehler</p>
            <p className="mt-1 text-sm">{fehler}</p>
          </CardBody>
        </Card>
      ) : null}

      <Einklappbar id="fragen-neuer-beitrag" title="✍️ Neuer Beitrag">
        <form action={createQuestion} className="space-y-4">
            <Field label="Art">
              <select name="kind" className={inputClass} defaultValue="frage">
                {Object.entries(FRAGE_ARTEN).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Frage / Anliegen">
              <input name="title" required className={inputClass} />
            </Field>
            <Field label="Details (optional)">
              <textarea name="body" rows={3} className={inputClass} />
            </Field>
            <Field label="Bereich">
              <select name="team_id" className={inputClass}>
                <option value="">Gesamter Verein</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="submit">Abschicken</Button>
        </form>
      </Einklappbar>

      <section className="space-y-3">
        {questions.length === 0 ? (
          <EmptyState
            title="Noch keine Beiträge"
            hint="Stell die erste Frage oder gib Feedback!"
          />
        ) : (
          questions.map((q) => (
            <Link key={q.id} href={`/mitglieder/fragen/${q.id}`}>
              <Card className="transition hover:border-primary">
                <CardBody className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{q.title}</span>
                      <Badge tone="primary">{frageArtLabel(q.kind)}</Badge>
                      <Badge>{teamName(q.team_id) ?? "Verein"}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {q.author?.full_name || "Mitglied"} · {formatDate(q.created_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm text-muted">
                    {q.answers?.[0]?.count ?? 0} Antw.
                  </span>
                </CardBody>
              </Card>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}
