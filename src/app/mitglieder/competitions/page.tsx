import Link from "next/link";
import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getManageableTeamIds } from "@/lib/member-queries";
import {
  createCompetition,
  toggleCompetition,
  deleteCompetition,
  addCompetitionDate,
  deleteCompetitionDate,
} from "./actions";
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
  WEEKDAYS,
  weekdayLabel,
  mapsUrl,
  type Competition,
  type CompetitionDate,
} from "@/lib/extras";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Competitions im Umkreis" };

export default async function CompetitionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string; archiv?: string }>;
}) {
  const { tag, archiv } = await searchParams;
  const showArchive = archiv === "1";
  const dayFilter = tag ? Number(tag) : null;

  const profile = await requireProfile();
  const canManage =
    profile.role === "admin" ||
    (await getManageableTeamIds(profile)).size > 0;

  const supabase = await createClient();
  const { data } = await supabase
    .from("competitions")
    .select("*")
    .eq("is_active", !showArchive)
    .order("weekday")
    .order("start_time");
  const all = (data as Competition[]) ?? [];

  // Konkrete Termine unserer eigenen Competition (Feed)
  const todayStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
  }).format(new Date());
  const { data: dateData } = await supabase
    .from("competition_dates")
    .select("*")
    .gte("date", todayStr)
    .order("date");
  const ownDates = (dateData as CompetitionDate[]) ?? [];
  const competitions = dayFilter
    ? all.filter((c) => c.weekday === dayFilter)
    : all;

  const chip = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium ${
      active
        ? "bg-primary text-primary-fg"
        : "border border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competitions im Umkreis"
        subtitle="Wöchentliche Competitions in der Umgebung – Wochentag antippen zum Filtern"
      />

      {/* Wochentag-Filter */}
      {!showArchive && (
        <div className="flex flex-wrap gap-2">
          <Link href="/mitglieder/competitions" className={chip(!dayFilter)}>
            Alle{all.length ? ` (${all.length})` : ""}
          </Link>
          {WEEKDAYS.map((w) => {
            const count = all.filter((c) => c.weekday === w.value).length;
            if (count === 0 && dayFilter !== w.value) return null;
            return (
              <Link
                key={w.value}
                href={`/mitglieder/competitions?tag=${w.value}`}
                className={chip(dayFilter === w.value)}
              >
                {w.label}
              </Link>
            );
          })}
          <Link
            href="/mitglieder/competitions?archiv=1"
            className="ml-auto rounded-full border border-border px-4 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Archiv
          </Link>
        </div>
      )}
      {showArchive && (
        <Link
          href="/mitglieder/competitions"
          className="inline-block text-sm text-primary hover:underline"
        >
          ← Zurück zu den aktiven Competitions
        </Link>
      )}

      {/* Unsere eigenen Competition-Termine (Feed) */}
      {!showArchive && (
        <Card className="bg-primary/5">
          <CardBody className="space-y-3">
            <div>
              <h2 className="font-semibold">🎯 Unsere Competition-Termine</h2>
              <p className="text-sm text-muted">
                Konkrete Termine der TSG-Competition – sie erscheinen auch im
                öffentlichen Dart-Feed (<code>/api/dart-feed</code>) für andere
                Programme. Vergangene Termine verschwinden automatisch.
              </p>
            </div>

            {ownDates.length === 0 ? (
              <p className="text-sm text-muted">
                Keine kommenden Termine eingetragen.
              </p>
            ) : (
              <div className="space-y-1">
                {ownDates.map((d) => (
                  <div
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm hover:bg-border/30"
                  >
                    <span>
                      📅 <strong>{formatDate(d.date)}</strong>
                      {d.nr ? ` · ${d.nr}. Competition` : ""}
                      {d.boards ? ` · ${d.boards} Boards` : ""}
                      {d.event_url && (
                        <>
                          {" · "}
                          <a
                            href={d.event_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary hover:underline"
                          >
                            Zur Anmeldung →
                          </a>
                        </>
                      )}
                    </span>
                    {canManage && (
                      <form action={deleteCompetitionDate}>
                        <input type="hidden" name="id" value={d.id} />
                        <button className="text-danger hover:underline">
                          Löschen
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}

            {canManage && (
              <form
                action={addCompetitionDate}
                className="flex flex-wrap items-end gap-2 border-t border-border pt-3"
              >
                <Field label="Datum">
                  <input
                    name="date"
                    type="date"
                    required
                    className={inputClass}
                  />
                </Field>
                <Field label="Nr. (optional)">
                  <input
                    name="nr"
                    type="number"
                    min={1}
                    className={`${inputClass} w-24`}
                  />
                </Field>
                <Field label="Boards (optional)">
                  <input
                    name="boards"
                    type="number"
                    min={1}
                    className={`${inputClass} w-24`}
                  />
                </Field>
                <Field label="Anmelde-/Event-Link (optional)">
                  <input
                    name="event_url"
                    type="url"
                    placeholder="https://…"
                    className={inputClass}
                  />
                </Field>
                <Button type="submit" variant="secondary">
                  Termin eintragen
                </Button>
              </form>
            )}
          </CardBody>
        </Card>
      )}

      {/* Neue Competition (Admins + Kapitäne) */}
      {canManage && !showArchive && (
        <details className="group rounded-xl border border-border bg-surface">
          <summary className="cursor-pointer px-5 py-4 font-semibold">
            ➕ Competition eintragen
          </summary>
          <div className="border-t border-border p-5">
            <form action={createCompetition} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name">
                  <input name="title" required className={inputClass} />
                </Field>
                <Field label="Wochentag">
                  <select name="weekday" required className={inputClass}>
                    {WEEKDAYS.map((w) => (
                      <option key={w.value} value={w.value}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Modus (optional)" hint="z. B. Schweizer System + KO, Doppel-KO, Nur Gruppenphase">
                  <input name="mode" className={inputClass} />
                </Field>
                <Field label="Adresse" hint="Öffnet für alle die Karte">
                  <input name="address" className={inputClass} />
                </Field>
                <Field label="Einlass ab (optional)">
                  <input name="doors_time" type="time" className={inputClass} />
                </Field>
                <Field label="Beginn">
                  <input
                    name="start_time"
                    type="time"
                    required
                    defaultValue="19:00"
                    className={inputClass}
                  />
                </Field>
                <Field label="Anmelden bis (optional)">
                  <input name="signup_until" type="time" className={inputClass} />
                </Field>
                <Field label="Anzahl Boards (optional)">
                  <input
                    name="boards"
                    type="number"
                    min={1}
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
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="onsite_signup" defaultChecked />
                Anmeldung vor Ort möglich
              </label>
              <Button type="submit">Competition eintragen</Button>
            </form>
          </div>
        </details>
      )}

      {/* Liste */}
      {competitions.length === 0 ? (
        <EmptyState
          title={
            showArchive
              ? "Keine archivierten Competitions"
              : "Keine Competitions gefunden"
          }
          hint={
            showArchive
              ? undefined
              : "Admins und Kapitäne können oben Competitions eintragen."
          }
        />
      ) : (
        <div className="space-y-3">
          {competitions.map((c) => {
            const mayEdit =
              profile.role === "admin" || c.created_by === profile.id;
            return (
              <Card key={c.id} className={showArchive ? "opacity-70" : ""}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.title}</span>
                    <Badge tone="primary">{weekdayLabel(c.weekday)}s</Badge>
                    {c.mode && <Badge>{c.mode}</Badge>}
                    {c.boards && <Badge>🎯 {c.boards} Boards</Badge>}
                  </div>

                  <p className="text-sm text-muted">
                    {c.doors_time && <>Einlass ab {c.doors_time} Uhr · </>}
                    Beginn <strong>{c.start_time} Uhr</strong>
                    {c.signup_until && <> · Anmelden bis {c.signup_until} Uhr</>}
                  </p>

                  {c.address && (
                    <p className="text-sm">
                      📍{" "}
                      <a
                        href={mapsUrl(c.address)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {c.address}
                      </a>
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    {c.register_url && !showArchive && (
                      <a
                        href={c.register_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-fg hover:opacity-90"
                      >
                        📝 Zur Anmeldung
                      </a>
                    )}
                    {c.onsite_signup && (
                      <Badge tone="ok">🖐 Anmeldung vor Ort möglich</Badge>
                    )}

                    {mayEdit && (
                      <span className="ml-auto flex items-center gap-3">
                        <form action={toggleCompetition}>
                          <input type="hidden" name="id" value={c.id} />
                          <input
                            type="hidden"
                            name="is_active"
                            value={String(c.is_active)}
                          />
                          <button
                            className={`text-sm hover:underline ${
                              c.is_active ? "text-warn" : "text-ok"
                            }`}
                          >
                            {c.is_active ? "Archivieren" : "Aktivieren"}
                          </button>
                        </form>
                        <form action={deleteCompetition}>
                          <input type="hidden" name="id" value={c.id} />
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
