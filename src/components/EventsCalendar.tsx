import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import { formatTime } from "@/lib/format";
import { CalendarEventChip } from "@/components/CalendarEventChip";
import type { EventRow, EventType, RsvpStatus } from "@/lib/types";

// Monats-Kalender mit Mannschafts-Filter. Wiederverwendbar:
// "base" ist die Seite, auf der er eingebettet ist (Links bleiben dort).

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

function makeHref(base: string, params: Record<string, string | undefined>) {
  const qs = Object.entries(params)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return qs ? `${base}${base.includes("?") ? "&" : "?"}${qs}` : base;
}

const eventChipClass: Record<EventType, string> = {
  match: "bg-primary text-primary-fg",
  pokal: "bg-purple-600 text-white",
  friendly: "bg-ok/20 text-ok",
  training: "bg-warn/20 text-warn",
  meeting: "bg-border/70",
  other: "bg-border/70",
};

export async function EventsCalendar({
  base,
  monat,
  team,
}: {
  base: string;
  monat?: string;
  team?: string;
}) {
  const { y, m } = parseMonth(monat);
  const teams = await getAllTeams();
  const teamFilter = team ?? "";

  // Rasterbereich (Montag vor dem 1. bis Sonntag nach dem Letzten)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = So
  const lead = (firstDow + 6) % 7;
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

  // Eigene Zu-/Absagen für die angezeigten Termine
  // (ohne eigene Antwort greift die Standard-Rückmeldung der Mannschaft)
  const defaultByTeam = new Map<string, RsvpStatus>();
  for (const t of teams) {
    if (t.default_rsvp) defaultByTeam.set(t.id, t.default_rsvp as RsvpStatus);
  }
  const statusMap = new Map<string, RsvpStatus>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && events.length) {
    const { data: rsvps } = await supabase
      .from("rsvps")
      .select("event_id,status")
      .eq("profile_id", user.id)
      .in("event_id", events.map((e) => e.id));
    for (const r of rsvps ?? []) {
      statusMap.set(r.event_id as string, r.status as RsvpStatus);
    }
  }

  const todayKey = berlinDay.format(new Date());
  const prev = addMonth(y, m, -1);
  const next = addMonth(y, m, 1);
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
          href={makeHref(base, { monat: ym(y, m) })}
          className={filterChip(!teamFilter)}
        >
          Alle
        </Link>
        <Link
          href={makeHref(base, { monat: ym(y, m), team: "verein" })}
          className={filterChip(teamFilter === "verein")}
        >
          Verein
        </Link>
        {teams.map((t) => (
          <Link
            key={t.id}
            href={makeHref(base, { monat: ym(y, m), team: t.id })}
            className={filterChip(teamFilter === t.id)}
          >
            {t.name}
          </Link>
        ))}
      </div>

      {/* Monats-Navigation */}
      <div className="flex items-center justify-between">
        <Link
          href={makeHref(base, { monat: ym(prev.y, prev.m), team: teamFilter || undefined })}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-border/40"
        >
          ← {monthLabelFmt.format(new Date(Date.UTC(prev.y, prev.m - 1, 1)))}
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold">{monthLabel}</h2>
          <Link
            href={makeHref(base, { team: teamFilter || undefined })}
            className="text-sm text-primary hover:underline"
          >
            Heute
          </Link>
        </div>
        <Link
          href={makeHref(base, { monat: ym(next.y, next.m), team: teamFilter || undefined })}
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
                      <CalendarEventChip
                        key={ev.id}
                        eventId={ev.id}
                        title={ev.title}
                        time={
                          formatTime(ev.starts_at) !== "00:00"
                            ? formatTime(ev.starts_at)
                            : ""
                        }
                        location={ev.location ?? ""}
                        chipClass={eventChipClass[ev.type]}
                        myStatus={
                          statusMap.get(ev.id) ??
                          (ev.team_id
                            ? (defaultByTeam.get(ev.team_id) ?? null)
                            : null)
                        }
                      />
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
        <span className="rounded bg-purple-600 px-1.5 py-0.5 text-white">
          Pokalspiel
        </span>{" "}
        <span className="rounded bg-ok/20 px-1.5 py-0.5 text-ok">
          Freundschaftsspiel
        </span>{" "}
        <span className="rounded bg-warn/20 px-1.5 py-0.5 text-warn">
          Training
        </span>{" "}
        <span className="rounded bg-border/70 px-1.5 py-0.5">Sonstiges</span> ·
        Termin antippen für Zu-/Absage direkt im Kalender · ✓/~/✗ = deine
        Antwort.
      </p>
    </section>
  );
}
