import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAnswer } from "../actions";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  inputClass,
  EmptyState,
} from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export default async function FrageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  const { data: question } = await supabase
    .from("questions")
    .select("id,title,body,created_at,author:profiles(full_name)")
    .eq("id", id)
    .maybeSingle();

  if (!question) notFound();
  const q = question as unknown as {
    id: string;
    title: string;
    body: string | null;
    created_at: string;
    author: { full_name: string } | null;
  };

  const { data: answersData } = await supabase
    .from("answers")
    .select("id,body,created_at,author:profiles(full_name)")
    .eq("question_id", id)
    .order("created_at", { ascending: true });

  const answers = (answersData ?? []) as unknown as Array<{
    id: string;
    body: string;
    created_at: string;
    author: { full_name: string } | null;
  }>;

  return (
    <div className="space-y-6">
      <Link
        href="/mitglieder/fragen"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Fragen
      </Link>

      <PageHeader
        title={q.title}
        subtitle={`${q.author?.full_name || "Mitglied"} · ${formatDateTime(
          q.created_at,
        )}`}
      />

      {q.body && (
        <Card>
          <CardBody>
            <p className="whitespace-pre-line text-muted">{q.body}</p>
          </CardBody>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">
          Antworten{" "}
          <span className="text-sm font-normal text-muted">
            ({answers.length})
          </span>
        </h2>
        {answers.length === 0 ? (
          <EmptyState title="Noch keine Antworten" />
        ) : (
          answers.map((a) => (
            <Card key={a.id}>
              <CardBody>
                <p className="whitespace-pre-line">{a.body}</p>
                <p className="mt-2 text-xs text-muted">
                  {a.author?.full_name || "Mitglied"} · {formatDateTime(a.created_at)}
                </p>
              </CardBody>
            </Card>
          ))
        )}
      </section>

      <Card>
        <CardBody>
          <form action={createAnswer} className="space-y-3">
            <input type="hidden" name="question_id" value={q.id} />
            <textarea
              name="body"
              rows={3}
              required
              placeholder="Deine Antwort …"
              className={inputClass}
            />
            <Button type="submit">Antworten</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
