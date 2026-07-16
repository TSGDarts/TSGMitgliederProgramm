import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createAnnouncement,
  deleteAnnouncement,
  createPoll,
  togglePoll,
  deletePoll,
} from "./actions";
import { Umfrage, type UmfrageDaten } from "./Umfrage";
import { Einklappbar } from "@/components/Einklappbar";
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
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Schwarzes Brett" };

export default async function BrettPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; gespeichert?: string }>;
}) {
  const profile = await requireProfile();
  const { fehler, gespeichert } = await searchParams;
  const kannPflegen = profile.role === "admin" || profile.role === "editor";
  const supabase = await createClient();

  const [{ data: annData }, { data: pollData }, { data: voteData }] =
    await Promise.all([
      supabase
        .from("announcements")
        .select("id, title, body, created_at, author:profiles(full_name)")
        .order("created_at", { ascending: false }),
      supabase
        .from("polls")
        .select("*")
        .order("open", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("poll_votes")
        .select("poll_id, option_index, profile_id, profiles(full_name)"),
    ]);

  const ankuendigungen = (annData ?? []) as unknown as Array<{
    id: string;
    title: string;
    body: string;
    created_at: string;
    author: { full_name: string } | null;
  }>;

  const polls = (pollData ?? []) as Array<{
    id: string;
    question: string;
    options: string[];
    multi: boolean;
    open: boolean;
    created_at: string;
  }>;

  const umfragen: UmfrageDaten[] = polls.map((p) => {
    const stimmen = (voteData ?? []).filter((v) => v.poll_id === p.id);
    return {
      id: p.id,
      question: p.question,
      options: p.options,
      multi: p.multi,
      open: p.open,
      namenJeOption: p.options.map((_, i) =>
        stimmen
          .filter((v) => v.option_index === i)
          .map(
            (v) =>
              ((v.profiles as unknown as { full_name: string } | null)
                ?.full_name ?? "?") as string,
          )
          .sort((a, b) => a.localeCompare(b)),
      ),
      meineAuswahl: stimmen
        .filter((v) => v.profile_id === profile.id)
        .map((v) => v.option_index as number),
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="📢 Schwarzes Brett"
        subtitle="Ankündigungen des Vereins und Umfragen zum Abstimmen"
      />

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody>
            <p className="font-semibold text-danger">⚠️ Fehler</p>
            <p className="mt-1 text-sm">{fehler}</p>
          </CardBody>
        </Card>
      ) : null}

      {kannPflegen && (
        <Einklappbar
          id="brett-neue-ankuendigung"
          title="✍️ Neue Ankündigung"
          defaultOpen={false}
          zuklappBei={
            gespeichert?.startsWith("ankuendigung-") ? gespeichert : undefined
          }
        >
          <form action={createAnnouncement} className="space-y-3">
            <Field label="Titel">
              <input name="title" required className={inputClass} />
            </Field>
            <Field label="Text (optional)">
              <textarea name="body" rows={4} className={inputClass} />
            </Field>
            <Button type="submit">Veröffentlichen (mit Benachrichtigung)</Button>
          </form>
        </Einklappbar>
      )}

      {kannPflegen && (
        <Einklappbar
          id="brett-neue-umfrage"
          title="🗳 Neue Umfrage"
          defaultOpen={false}
          zuklappBei={
            gespeichert?.startsWith("umfrage-") ? gespeichert : undefined
          }
        >
          <form action={createPoll} className="space-y-3">
            <Field label="Frage">
              <input
                name="question"
                required
                placeholder="z. B. Weihnachtsfeier: welcher Termin passt?"
                className={inputClass}
              />
            </Field>
            <Field
              label="Antwortmöglichkeiten"
              hint="Eine Möglichkeit pro Zeile (mindestens zwei)"
            >
              <textarea
                name="options"
                rows={4}
                required
                placeholder={"Sa., 12.12.\nSa., 19.12."}
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="multi" />
              Mehrfachauswahl erlauben
            </label>
            <Button type="submit">Umfrage starten (mit Benachrichtigung)</Button>
          </form>
        </Einklappbar>
      )}

      {/* Umfragen */}
      {umfragen.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold">🗳 Umfragen</h2>
          {umfragen.map((u) => (
            <Einklappbar
              key={u.id}
              id={`umfrage-${u.id}`}
              title={
                <span>
                  {u.question}{" "}
                  {!u.open && <Badge>geschlossen</Badge>}
                </span>
              }
              defaultOpen={u.open}
            >
              <div className="space-y-3">
                <Umfrage daten={u} />
                {kannPflegen && (
                  <div className="flex flex-wrap gap-3 border-t border-border pt-2">
                    <form action={togglePoll}>
                      <input type="hidden" name="id" value={u.id} />
                      <input
                        type="hidden"
                        name="open"
                        value={String(!u.open)}
                      />
                      <button className="text-sm text-primary hover:underline">
                        {u.open ? "Umfrage schließen" : "Wieder öffnen"}
                      </button>
                    </form>
                    <form action={deletePoll}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-sm text-danger hover:underline">
                        Löschen
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </Einklappbar>
          ))}
        </section>
      )}

      {/* Ankündigungen */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">📢 Ankündigungen</h2>
        {ankuendigungen.length === 0 ? (
          <EmptyState
            title="Noch keine Ankündigungen"
            hint="Neuigkeiten des Vereins erscheinen hier – mit Benachrichtigung an alle."
          />
        ) : (
          ankuendigungen.map((a) => (
            <Card key={a.id}>
              <CardBody className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{a.title}</span>
                  {kannPflegen && (
                    <form action={deleteAnnouncement}>
                      <input type="hidden" name="id" value={a.id} />
                      <button className="text-sm text-danger hover:underline">
                        Löschen
                      </button>
                    </form>
                  )}
                </div>
                {a.body && (
                  <p className="whitespace-pre-line text-sm">{a.body}</p>
                )}
                <p className="text-xs text-muted">
                  {a.author?.full_name || "Verein"} ·{" "}
                  {formatDateTime(a.created_at)}
                </p>
              </CardBody>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
