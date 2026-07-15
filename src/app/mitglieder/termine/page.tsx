import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getMemberEvents, getAllTeams } from "@/lib/member-queries";
import { EventCard } from "@/components/EventCard";
import { PageHeader, EmptyState, Card, CardBody } from "@/components/ui";
import { formatTime } from "@/lib/format";
import type { EventRow, EventType } from "@/lib/types";

export const metadata: Metadata = { title: "Termine & Zusagen" };

// ---------- Kalender-Hilfen ----------

const berlinDay = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const monthLabelFmt = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function parseMonth(monat?: string): { y: number; m: number } {
  const match = monat ? /^(\d{4})-(\d{2})$/.exec(monat) : null;
  if (match) return { y: Number(match[1]), m: Number(match[2]) };
  const today = berlinDay.format(new Date()); // "YYYY-MM-DD"
  return { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
}

function ym(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function addMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const total = y * 12 + (m - 1) + delta;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}

const eventChipClass: Record<EventType, string> = {
  match: "bg-primary text-primary-fg",
  friendly: "bg-ok/20 text-ok",
  training: "bg-warn/20 text-warn",
  meeting: "bg-border/70",
  other: "bg-border/70",
};

// ---------- Seite ----------

export default async function MemberTerminePage({
  searchParams,
}: {
  searchParams: Promise<{ ansicht?: string; monat?: string; team?: string }>;
}) {
  const { ansicht, monat, team } = await searchParams;
  const isCalendar = ansicht === "kalender";
  const profile = await requireProfile();

  const viewChip = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium ${
      active
        ? "bg-primary text-primary-fg"
        : "border border-border text-muted hover:text-foreground"
    }`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Termine & Zusagen"
        subtitle="Sag zu oder ab – für Spieltage, Freundschaftsspiele und Training"
      />

      {/* Ansicht wählen */}
      <div className="flex gap-2">
        <Link href="/mitglieder/termine" className={viewChip(!isCalendar)}>
          📋 Liste
        </Link>
        <Link
          href="/mitglieder/termine?ansicht=kalender"
          className={viewChip(isCalendar)}
        >
          🗓️ Kalender
        </Link>
      </div>

      <Card className="bg-primary/5">
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">📄 Rahmenterminplan 2026/27 & 2027/28</p>
            <p className="text-sm text-muted">
              Der offizielle Rahmenterminplan (Mittelfranken / BDV / DDV) als
              PDF – die Spielwochen stehen auch unten im Kalender.
            </p>
          </div>
          <a
            href="/rahmenterminplan.pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-border/40"
          >
            PDF öffnen
          </a>
        </CardBody>
      </Card>

      {isCalendar ? (
        <CalendarView monat={monat} team={team} />
      ) : (
        <ListView profileId={profile.id} />
      )}
    </div>
  );
}

// ---------- Listen-Ansicht (wie bisher) ----------

async function ListView({ profileId }: { profileId: string }) {
  const [upcoming, past] = await Promise.all([
    getMemberEvents(profileId),
    getMemberEvents(profileId, { past: true, limit: 10 }),
  ]);

  return (
    <>
      <section>
        <h2 className="mb-3 text-lg font-bold">Anstehend</h2>
        {upcoming.length === 0 ? (
          <EmptyState title="Keine anstehenden Termine" />
        ) : (
          <div className="space-y-3">
            {upcoming.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-muted">Vergangen</h2>
          <div className="space-y-3 opacity-70">
            {past.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

// ---------- Kalender-Ansicht ----------

async function CalendarView({
  monat,
  team,
}: {
  monat?: string;
  team?: string;
}) {
  const { y, m } = parseMonth(monat);
  const teams = await getAllTeams();
  const teamFilter = team ?? "";

  // Rasterbereich (Montag vor dem 1. bis Sonntag nach dem Letzten)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = So
  const lead = (firstDow + 6) % 7; // Tage vor dem 1. bis Montag
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const gridStart = Date.UTC(y, m - 1, 1 - lead);

  const supabase = await createClient();
  const { data } = await supabase
    .from("events")
    .select("*")
    .gte("starts_at", new Date(gridStart).toISOString())
    .lt("starts_at", new Date(gridStart + totalCells * 864e5).toISOString())
    .order("starts_at");
  let events = (data as EventRow[]) ?? [];
  if (teamFilter === "verein") {
    events = events.filter((e) => e.team_id === null);
  } else if (teamFilter) {
    events = events.filter((e) => e.team_id === teamFilter);
  }

  // Termine nach Berliner Kalendertag gruppieren
  const byDay = new Map<string, EventRow[]>();
  for (const ev of events) {
    const key = berlinDay.format(new Date(ev.starts_at));
    const list = byDay.get(key) ?? [];
    list.push(ev);
    byDay.set(key, list);
  }

  const todayKey = berlinDay.format(new Date());
  const prev = addMonth(y, m, -1);
  const next = addMonth(y, m, 1);
  const teamQS = teamFilter ? `&team=${teamFilter}` : "";
  const monthLabel = monthLabelFmt.format(new Date(Date.UTC(y, m - 1, 1)));

  const filterChip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium ${
      active
        ? "bg-primary text-primary-fg"
        : "border border-border text-muted hover:text-foreground"
    }`;

  return (
    <section className="space-y-4">
      {/* Mannschafts-Filter */}
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/mitglieder/termine?ansicht=kalender&monat=${ym(y, m)}`}
          className={filterChip(!teamFilter)}
        >
          Alle
        </Link>
        <Link
          href={`/mitglieder/termine?ansicht=kalender&monat=${ym(y, m)}&team=verein`}
          className={filterChip(teamFilter === "verein")}
        >
          Verein
        </Link>
        {teams.map((t) => (
          <Link
            key={t.id}
            href={`/mitglieder/termine?ansicht=kalender&monat=${ym(y, m)}&team=${t.id}`}
            className={filterChip(teamFilter === t.id)}
          >
            {t.name}
          </Link>
        ))}
      </div>

      {/* Monats-Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={`/mitglieder/termine?ansicht=kalender&monat=${ym(prev.y, prev.m)}${teamQS}`}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-border/40"
        >
          ← {monthLabelFmt.format(new Date(Date.UTC(prev.y, prev.m - 1, 1)))}
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">{monthLabel}</h2>
          <Link
            href={`/mitglieder/termine?ansicht=kalender${teamQS}`}
            className="text-sm text-primary hover:underline"
          >
            Heute
          </Link>
        </div>
        <Link
          href={`/mitglieder/termine?ansicht=kalender&monat=${ym(next.y, next.m)}${teamQS}`}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-border/40"
        >
          {monthLabelFmt.format(new Date(Date.UTC(next.y, next.m - 1, 1)))} →
        </Link>
      </div>

      {/* Raster */}
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-7 gap-1">
            {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
              <div
                key={d}
                className="px-2 py-1 text-center text-xs font-semibold uppercase text-muted"
              >
                {d}
              </div>
            ))}
            {Array.from({ length: totalCells }, (_, i) => {
              const date = new Date(gridStart + i * 864e5);
              const key = date.toISOString().slice(0, 10);
              const dayNum = date.getUTCDate();
              const inMonth = date.getUTCMonth() === m - 1;
              const dayEvents = byDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <div
                  key={key}
                  className={`min-h-24 rounded-lg border p-1.5 ${
                    isToday
                      ? "border-primary bg-primary/5"
                      : "border-border bg-surface"
                  } ${inMonth ? "" : "opacity-40"}`}
                >
                  <div
                    className={`mb-1 text-right text-xs font-semibold ${
                      isToday ? "text-primary" : "text-muted"
                    }`}
                  >
                    {dayNum}
                  </div>
                  <div className="space-y-1">
                    {dayEvents.map((ev) => (
                      <Link
                        key={ev.id}
                        href={`/mitglieder/termine/${ev.id}`}
                        title={`${formatTime(ev.starts_at)} Uhr – ${ev.title}${
                          ev.location ? ` (${ev.location})` : ""
                        }`}
                        className={`block truncate rounded px-1.5 py-0.5 text-xs hover:opacity-80 ${
                          eventChipClass[ev.type]
                        }`}
                      >
                        {formatTime(ev.starts_at) !== "00:00" && (
                          <span className="font-semibold">
                            {formatTime(ev.starts_at)}{" "}
                          </span>
                        )}
                        {ev.title}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">
        Farben:{" "}
        <span className="rounded bg-primary px-1.5 py-0.5 text-primary-fg">
          Punktspiel
        </span>{" "}
        <span className="rounded bg-ok/20 px-1.5 py-0.5 text-ok">
          Freundschaftsspiel
        </span>{" "}
        <span className="rounded bg-warn/20 px-1.5 py-0.5 text-warn">
          Training
        </span>{" "}
        <span className="rounded bg-border/70 px-1.5 py-0.5">Sonstiges</span> ·
        Termin antippen für Details & Zu-/Absage.
      </p>
    </section>
  );
}
