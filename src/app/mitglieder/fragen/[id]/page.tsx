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
import { getFragenKontakt, waNummer } from "@/lib/settings";
import { siteUrl } from "@/lib/supabase/config";
import { frageArtLabel } from "@/lib/types";
import { WhatsAppIcon } from "@/components/WhatsAppIcon";

export default async function FrageDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();

  // kind gibt es erst nach Skript 44 – bei alten Datenbanken ohne die
  // Spalte greift die Ersatz-Abfrage (alles zählt dann als Frage).
  let question: unknown = (
    await supabase
      .from("questions")
      .select(
        "id,title,body,kind,created_at,author:profiles(full_name),team:teams(name)",
      )
      .eq("id", id)
      .maybeSingle()
  ).data;
  if (!question) {
    question = (
      await supabase
        .from("questions")
        .select(
          "id,title,body,created_at,author:profiles(full_name),team:teams(name)",
        )
        .eq("id", id)
        .maybeSingle()
    ).data;
  }

  if (!question) notFound();
  const q = question as unknown as {
    id: string;
    title: string;
    body: string | null;
    kind?: string | null;
    created_at: string;
    author: { full_name: string } | null;
    team: { name: string } | null;
  };
  const artLabel = frageArtLabel(q.kind);
  // Für Fließtext/Betreff: Label ohne führendes Emoji („Idee“ statt „💡 Idee“)
  const artText = artLabel.replace(/^[^\p{L}]+/u, "");

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

  // Weiterleiten-Knöpfe: Frage zusammengefasst per E-Mail oder WhatsApp an
  // den Verein schicken (Kontakt pflegt der Admin unter „Einstellungen“).
  const kontakt = await getFragenKontakt();
  const zusammenfassung = [
    `${artText} von ${q.author?.full_name || "einem Mitglied"} (${q.team?.name ?? "Gesamter Verein"}):`,
    q.title,
    ...(q.body ? ["", q.body] : []),
    "",
    `Zum Beitrag in der App: ${siteUrl}/mitglieder/fragen/${q.id}`,
  ].join("\n");
  const mailtoLink = kontakt.email
    ? `mailto:${kontakt.email}?subject=${encodeURIComponent(`${artText}: ${q.title}`)}&body=${encodeURIComponent(zusammenfassung)}`
    : null;
  const waLink = kontakt.whatsapp
    ? `https://wa.me/${waNummer(kontakt.whatsapp)}?text=${encodeURIComponent(zusammenfassung)}`
    : null;

  return (
    <div className="space-y-6">
      <Link
        href="/mitglieder/fragen"
        className="text-sm text-primary hover:underline"
      >
        ← Alle Beiträge
      </Link>

      <PageHeader
        title={q.title}
        subtitle={`${artLabel} · ${q.author?.full_name || "Mitglied"} · ${formatDateTime(
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

      {(mailtoLink || waLink) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">An den Verein senden:</span>
          {mailtoLink && (
            <a
              href={mailtoLink}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
            >
              ✉️ Per E-Mail
            </a>
          )}
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <WhatsAppIcon /> Per WhatsApp
            </a>
          )}
        </div>
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
