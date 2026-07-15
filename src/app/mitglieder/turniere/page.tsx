import Link from "next/link";
import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getManageableTeamIds } from "@/lib/member-queries";
import { createTournament, archiveTournament, deleteTournament } from "./actions";
import { FlyerUpload } from "@/components/FlyerUpload";
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
import {
  TOURNAMENT_KIND_LABELS,
  TOURNAMENT_MODE_LABELS,
  mapsUrl,
  type Tournament,
} from "@/lib/extras";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";

export const metadata: Metadata = { title: "Turniere im Umkreis" };

export default async function TurnierePage({
  searchParams,
}: {
  searchParams: Promise<{ archiv?: string }>;
}) {
  const { archiv } = await searchParams;
  const showArchive = archiv === "1";

  const profile = await requireProfile();
  const canManage =
    profile.role === "admin" ||
    (await getManageableTeamIds(profile)).size > 0;

  const today = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  let query = supabase.from("tournaments").select("*");
  query = showArchive
    ? query.lt("display_until", today).order("starts_at", { ascending: false })
    : query.gte("display_until", today).order("starts_at", { ascending: true });
  const { data } = await query;
  const tournaments = (data as Tournament[]) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Turniere im Umkreis"
        subtitle="Steeldart-Turniere in der Region – eingetragen von Admins und Kapitänen"
      />

      {/* Aktuell / Archiv Umschalter */}
      <div className="flex gap-2">
        <Link
          href="/mitglieder/turniere"
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            !showArchive
              ? "bg-primary text-primary-fg"
              : "border border-border text-muted hover:text-foreground"
          }`}
        >
          Aktuell
        </Link>
        <Link
          href="/mitglieder/turniere?archiv=1"
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            showArchive
              ? "bg-primary text-primary-fg"
              : "border border-border text-muted hover:text-foreground"
          }`}
        >
          Archiv
        </Link>
      </div>

      {/* Neues Turnier (Admins + Kapitäne) */}
      {canManage && !showArchive && (
        <details className="group rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-4 font-semibold">
            ➕ Turnier eintragen
          </summary>
          <div className="border-t border-border p-5">
            <form action={createTournament} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Turniername">
                  <input name="title" required className={inputClass} />
                </Field>
                <Field label="Ort (Adresse)">
                  <input name="location" className={inputClass} />
                </Field>
                <Field label="Turnierart">
                  <select name="kind" defaultValue="frei" className={inputClass}>
                    {Object.entries(TOURNAMENT_KIND_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Einzel oder Doppel">
                  <select name="mode" defaultValue="einzel" className={inputClass}>
                    <option value="einzel">Einzelturnier</option>
                    <option value="doppel">Doppelturnier</option>
                  </select>
                </Field>
                <Field label="Turnierbeginn">
                  <input
                    name="starts_at"
                    type="datetime-local"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Einlass ab (optional)">
                  <input name="doors_time" type="time" className={inputClass} />
                </Field>
                <Field label="Anmeldeschluss (optional)">
                  <input
                    name="entry_deadline"
                    type="datetime-local"
                    className={inputClass}
                  />
                </Field>
                <Field label="Anmeldelink (optional)">
                  <input
                    name="register_url"
                    type="url"
                    placeholder="https://…"
                    className={inputClass}
                  />
                </Field>
                <Field label="Link zum Turnier (optional)">
                  <input
                    name="info_url"
                    type="url"
                    placeholder="https://…"
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Anzeigen bis (optional)"
                  hint="Danach wandert das Turnier automatisch ins Archiv. Leer = Turniertag."
                >
                  <input name="display_until" type="date" className={inputClass} />
                </Field>
                <Field label="Flyer (Bild oder PDF, optional)">
                  <FlyerUpload />
                </Field>
              </div>
              <Button type="submit">Turnier eintragen</Button>
            </form>
          </div>
        </details>
      )}

      {/* Liste */}
      {tournaments.length === 0 ? (
        <EmptyState
          title={
            showArchive
              ? "Noch keine archivierten Turniere"
              : "Aktuell keine Turniere eingetragen"
          }
          hint={
            showArchive
              ? undefined
              : "Admins und Kapitäne können oben Turniere eintragen."
          }
        />
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => {
            const mayEdit =
              profile.role === "admin" ||
              profile.role === "editor" ||
              t.created_by === profile.id;
            return (
              <Card key={t.id} className={showArchive ? "opacity-70" : ""}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{t.title}</span>
                        <Badge tone="primary">
                          {TOURNAMENT_KIND_LABELS[t.kind]}
                        </Badge>
                        <Badge>{TOURNAMENT_MODE_LABELS[t.mode]}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted">
                        📅 {formatDate(t.starts_at)}
                        {t.doors_time && <> · Einlass {t.doors_time} Uhr</>} ·
                        Beginn {formatTime(t.starts_at)} Uhr
                        {t.entry_deadline && (
                          <>
                            {" "}
                            · Meldeschluss: {formatDateTime(t.entry_deadline)}
                          </>
                        )}
                      </p>
                      {t.location && (
                        <p className="text-sm text-muted">
                          📍{" "}
                          <a
                            href={mapsUrl(t.location)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            {t.location}
                          </a>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {t.register_url && !showArchive && (
                      <a
                        href={t.register_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                      >
                        📝 Zur Anmeldung
                      </a>
                    )}
                    {t.flyer_url && (
                      <a
                        href={t.flyer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-border/40"
                      >
                        🖼️ Flyer
                      </a>
                    )}
                    {t.info_url && (
                      <a
                        href={t.info_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-lg border border-border px-4 py-1.5 text-sm font-medium hover:bg-border/40"
                      >
                        🔗 Zum Turnier
                      </a>
                    )}

                    {mayEdit && (
                      <span className="ml-auto flex items-center gap-3">
                        {!showArchive && (
                          <form action={archiveTournament}>
                            <input type="hidden" name="id" value={t.id} />
                            <button className="text-sm text-warn hover:underline">
                              Archivieren
                            </button>
                          </form>
                        )}
                        <form action={deleteTournament}>
                          <input type="hidden" name="id" value={t.id} />
                          <button className="text-sm text-danger hover:underline">
                            Löschen
                          </button>
                        </form>
                      </span>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
