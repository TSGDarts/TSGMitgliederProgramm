import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getAllTeams } from "@/lib/member-queries";
import { getEventArchiveDays } from "@/lib/settings";
import { formatTime } from "@/lib/format";
import { CalendarEventChip } from "@/components/CalendarEventChip";
import { MonthPicker } from "@/components/MonthPicker";
import { isCompSpiegel } from "@/lib/types";
import { feiertageBayern } from "@/lib/feiertage";
import type { EventRow, EventType, RsvpStatus } from "@/lib/types";
import type { Tournament } from "@/lib/extras";

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
  // Auch mehrtägige Termine erfassen, die vor dem Raster beginnen,
  // aber erst darin enden (ends_at im Rasterbereich).
  const gridStartIso = new Date(gridStart).toISOString();
  const { data } = await supabase
    .from("events")
    .select("*")
    .or(`starts_at.gte.${gridStartIso},ends_at.gte.${gridStartIso}`)
    .lt("starts_at", new Date(gridStart + totalCells * 864e5).toISOString())
    .order("starts_at");
  let events = (data as EventRow[]) ?? [];
  if (teamFilter === "verein") {
    events = events.filter((e) => e.team_id === null);
  } else if (teamFilter) {
    events = events.filter((e) => e.team_id === teamFilter);
  }

  // Archiv-Frist: ältere Termine ausblenden (bleiben in der Datenbank).
  // Bei mehrtägigen Terminen zählt das Ende.
  const archiveDays = await getEventArchiveDays();
  const cutoffKey = berlinDay.format(
    new Date(Date.now() - archiveDays * 864e5),
  );
  events = events.filter(
    (e) => berlinDay.format(new Date(e.ends_at ?? e.starts_at)) >= cutoffKey,
  );

  // Termine nach Berliner Kalendertag gruppieren – mehrtägige Termine
  // erscheinen an jedem Tag ihres Zeitraums (Deckel gegen Ausreißer).
  const byDay = new Map<string, EventRow[]>();
  for (const ev of events) {
    const startKey = berlinDay.format(new Date(ev.starts_at));
    const endKey = ev.ends_at
      ? berlinDay.format(new Date(ev.ends_at))
      : startKey;
    const dayKeys = new Set<string>([startKey]);
    if (endKey > startKey) {
      let t = new Date(ev.starts_at).getTime();
      for (let i = 0; i < 62; i++) {
        t += 864e5;
        const k = berlinDay.format(new Date(t));
        if (k > endKey) break;
        dayKeys.add(k);
      }
    }
    for (const key of dayKeys) {
      const list = byDay.get(key) ?? [];
      list.push(ev);
      byDay.set(key, list);
    }
  }

  // Eigene Zu-/Absagen für die angezeigten Termine
  // (ohne eigene Antwort greift die Standard-Rückmeldung der Mannschaft)
  const defaultByTeam = new Map<string, RsvpStatus>();
  for (const t of teams) {
    if (t.default_rsvp) defaultByTeam.set(t.id, t.default_rsvp as RsvpStatus);
  }
  const statusMap = new Map<string, RsvpStatus>();
  let trainingDefault: RsvpStatus | null = null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // Persönliche Vorbelegung für Trainings (aus dem Profil)
    const { data: me } = await supabase
      .from("profiles")
      .select("training_default_rsvp")
      .eq("id", user.id)
      .maybeSingle();
    trainingDefault = ((me?.training_default_rsvp as string) ||
      null) as RsvpStatus | null;
  }
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

  // Turniere im Umkreis: erscheinen bei „Alle“ und „Verein“ als eigene
  // Kärtchen (mehrtägige an jedem Tag ihres Zeitraums).
  const tournamentsByDay = new Map<string, Tournament[]>();
  if (!teamFilter || teamFilter === "verein") {
    const gridEndIso = new Date(
      gridStart + totalCells * 864e5,
    ).toISOString();
    let { data: tourData } = await supabase
      .from("tournaments")
      .select("*")
      .or(`starts_at.gte.${gridStartIso},ends_at.gte.${gridStartIso}`)
      .lt("starts_at", gridEndIso)
      .order("starts_at");
    if (!tourData) {
      // Rückfall ohne ends_at-Filter (Spalte kommt erst mit Skript 29 –
      // ohne sie würde sonst die ganze Turnier-Abfrage scheitern)
      ({ data: tourData } = await supabase
        .from("tournaments")
        .select("*")
        .gte("starts_at", gridStartIso)
        .lt("starts_at", gridEndIso)
        .order("starts_at"));
    }
    for (const t of (tourData as Tournament[]) ?? []) {
      const startKey = berlinDay.format(new Date(t.starts_at));
      const endKey = t.ends_at
        ? berlinDay.format(new Date(t.ends_at))
        : startKey;
      // Von Hand archivierte ausblenden („Anzeigen bis“ vor dem Turniertag)
      if (t.display_until && t.display_until < startKey) continue;
      // Archiv-Frist wie bei Terminen (ab dem letzten Turniertag)
      if (endKey < cutoffKey) continue;
      const dayKeys = new Set<string>([startKey]);
      if (endKey > startKey) {
        let ts = new Date(t.starts_at).getTime();
        for (let i = 0; i < 62; i++) {
          ts += 864e5;
          const k = berlinDay.format(new Date(ts));
          if (k > endKey) break;
          dayKeys.add(k);
        }
      }
      for (const key of dayKeys) {
        const list = tournamentsByDay.get(key) ?? [];
        list.push(t);
        tournamentsByDay.set(key, list);
      }
    }
  }

  // Geburtstage (nur Mitglieder, die der Anzeige zugestimmt haben).
  // Erscheinen ausschließlich hier im Mitglieder-Kalender – nie in Feeds.
  const birthdayByDay = new Map<string, { name: string; age: number }[]>();
  const { data: bdayData } = await supabase
    .from("profiles")
    .select("full_name, birthday")
    .eq("birthday_public", true)
    .eq("is_active", true)
    .not("birthday", "is", null);
  const gridEnd = gridStart + totalCells * 864e5;
  for (const p of bdayData ?? []) {
    const bday = String(p.birthday); // JJJJ-MM-TT
    const bYear = Number(bday.slice(0, 4));
    const bMonth = Number(bday.slice(5, 7));
    const bDay = Number(bday.slice(8, 10));
    const startYear = new Date(gridStart).getUTCFullYear();
    const endYear = new Date(gridEnd).getUTCFullYear();
    for (let year = startYear; year <= endYear; year++) {
      const t = Date.UTC(year, bMonth - 1, bDay);
      // 29.02. in Nicht-Schaltjahren überspringen
      if (new Date(t).getUTCDate() !== bDay) continue;
      if (t >= gridStart && t < gridEnd) {
        const key = new Date(t).toISOString().slice(0, 10);
        const list = birthdayByDay.get(key) ?? [];
        list.push({ name: p.full_name as string, age: year - bYear });
        birthdayByDay.set(key, list);
      }
    }
  }

  // Gesetzliche Feiertage in Bayern (berechnet – reine Anzeige, kein Sync)
  const feiertagByDay = new Map<string, string>();
  for (
    let jahr = new Date(gridStart).getUTCFullYear();
    jahr <= new Date(gridEnd).getUTCFullYear();
    jahr++
  ) {
    for (const f of feiertageBayern(jahr)) feiertagByDay.set(f.datum, f.name);
  }

  const todayKey = berlinDay.format(new Date());
  const prev = addMonth(y, m, -1);
  const next = addMonth(y, m, 1);

  const filterChip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm font-medium ${
      active
        ? "bg-primary text-primary-fg"
        : "border border-border text-muted hover:text-foreground"
    }`;

  return (
    <section className="space-y-4">
      {/* Mannschafts-Filter + Heute-Knopf */}
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <Link
          href={makeHref(base, { team: teamFilter || undefined })}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-border/40"
        >
          📅 Heute
        </Link>
      </div>

      {/* Monats-Navigation: Monat & Jahr direkt wählbar */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={makeHref(base, { monat: ym(prev.y, prev.m), team: teamFilter || undefined })}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-border/40"
          title={monthLabelFmt.format(new Date(Date.UTC(prev.y, prev.m - 1, 1)))}
        >
          ←
        </Link>
        <MonthPicker base={base} y={y} m={m} team={teamFilter || undefined} />
        <Link
          href={makeHref(base, { monat: ym(next.y, next.m), team: teamFilter || undefined })}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-border/40"
          title={monthLabelFmt.format(new Date(Date.UTC(next.y, next.m - 1, 1)))}
        >
          →
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
              const isPast = key < todayKey;
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
                  <div
                    className={`space-y-1 ${isPast ? "opacity-50 grayscale" : ""}`}
                  >
                    {feiertagByDay.has(key) && (
                      <div
                        title={`${feiertagByDay.get(key)} – gesetzlicher Feiertag in Bayern`}
                        className="truncate rounded bg-teal-600/15 px-1.5 py-0.5 text-xs text-teal-600"
                      >
                        ⭐ {feiertagByDay.get(key)}
                      </div>
                    )}
                    {(birthdayByDay.get(key) ?? []).map((b) => (
                      <div
                        key={`bday-${b.name}`}
                        title={`${b.name} wird ${b.age} Jahre 🎂`}
                        className="truncate rounded bg-purple-600/15 px-1.5 py-0.5 text-xs text-purple-600"
                      >
                        🎂 {b.name}
                      </div>
                    ))}
                    {(tournamentsByDay.get(key) ?? []).map((t) => (
                      <Link
                        key={`tur-${t.id}`}
                        href="/mitglieder/turniere"
                        title={`${t.title}${
                          t.details_tbd
                            ? " – ⏳ Details folgen"
                            : formatTime(t.starts_at) !== "00:00"
                              ? ` – Beginn ${formatTime(t.starts_at)} Uhr`
                              : ""
                        }`}
                        className="block truncate rounded bg-sky-600/15 px-1.5 py-0.5 text-xs text-sky-600 hover:bg-sky-600/25"
                      >
                        🏟 {t.title}
                      </Link>
                    ))}
                    {dayEvents.map((ev) => (
                      <CalendarEventChip
                        key={ev.id}
                        eventId={ev.id}
                        title={ev.title}
                        time={
                          // Startzeit nur am ersten Tag des Zeitraums zeigen
                          berlinDay.format(new Date(ev.starts_at)) === key &&
                          !ev.time_tbd &&
                          formatTime(ev.starts_at) !== "00:00"
                            ? formatTime(ev.starts_at)
                            : ""
                        }
                        location={ev.location ?? ""}
                        chipClass={eventChipClass[ev.type]}
                        myStatus={
                          statusMap.get(ev.id) ??
                          (ev.type === "training" && trainingDefault
                            ? trainingDefault
                            : ev.team_id
                              ? (defaultByTeam.get(ev.team_id) ?? null)
                              : null)
                        }
                        rsvp={!isCompSpiegel(ev)}
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
        <span className="rounded bg-border/70 px-1.5 py-0.5">Sonstiges</span>{" "}
        <span className="rounded bg-sky-600/15 px-1.5 py-0.5 text-sky-600">
          🏟 Turnier
        </span>{" "}
        <span className="rounded bg-teal-600/15 px-1.5 py-0.5 text-teal-600">
          ⭐ Feiertag
        </span>{" "}
        <span className="rounded bg-purple-600/15 px-1.5 py-0.5 text-purple-600">
          🎂 Geburtstag
        </span>{" "}
        · Termin antippen für Zu-/Absage · ✓/~/✗ = deine Antwort · Geburtstage
        sind nur für Mitglieder sichtbar.
      </p>
    </section>
  );
}
