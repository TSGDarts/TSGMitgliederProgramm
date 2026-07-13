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

export const metadata: Metadata = { title: "Fragen" };

export default async function FragenPage() {
  await requireProfile();
  const teams = await getAllTeams();
  const supabase = await createClient();

  const { data } = await supabase
    .from("questions")
    .select("id,title,created_at,team_id,author:profiles(full_name),answers(count)")
    .order("created_at", { ascending: false });

  const questions = (data ?? []) as unknown as Array<{
    id: string;
    title: string;
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
        title="Fragen"
        subtitle="Stell eine Frage an den Verein oder deine Mannschaft"
      />

      <Card>
        <CardBody>
          <form action={createQuestion} className="space-y-4">
            <Field label="Frage">
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
            <Button type="submit">Frage stellen</Button>
          </form>
        </CardBody>
      </Card>

      <section className="space-y-3">
        {questions.length === 0 ? (
          <EmptyState title="Noch keine Fragen" hint="Stell die erste Frage!" />
        ) : (
          questions.map((q) => (
            <Link key={q.id} href={`/mitglieder/fragen/${q.id}`}>
              <Card className="transition hover:border-primary">
                <CardBody className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{q.title}</span>
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
