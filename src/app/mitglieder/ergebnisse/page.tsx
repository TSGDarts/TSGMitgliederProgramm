import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getAllTeams } from "@/lib/member-queries";
import { createClient } from "@/lib/supabase/server";
import { Einklappbar } from "@/components/Einklappbar";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import { formatDate, ergebnisTone } from "@/lib/format";
import { teileInRunden, teamBilanz } from "@/lib/runden";
import { vereinsAggregat } from "@/lib/statistik";
import { EVENT_TYPE_LABELS, type EventRow } from "@/lib/types";
import type { Season } from "@/lib/season";

export const metadata: Metadata = { title: "Ergebnisse" };

export default async function ErgebnissePage({
  searchParams,
}: {
  searchParams: Promise<{ saison?: string }>;
}) {
  const { saison } = await searchParams;
  await requireProfile();
  const supabase = await createClient();
  const teams = await getAllTeams();

  // Saison wählen (Standard: aktive Saison)
  const { data: saisonData } = await supabase
    .from("seasons")
    .select("*")
    .order("created_at", { ascending: false });
  const saisons = (saisonData as Season[]) ?? [];
  const gewaehlteSaison =
    saisons.find((s) => s.id === saison) ??
    saisons.find((s) => s.status === "active") ??
    saisons[0] ??
    null;

  // Alle gespielten Spiele der Saison je Mannschaft (inkl. vereinsweiter
  // Pokalspiele ohne Mannschaft)
  let q = supabase
    .from("events")
    .select("*")
    .in("type", ["match", "pokal", "friendly"])
    .lte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false });
  if (gewaehlteSaison?.starts_on) {
    q = q.gte("starts_at", gewaehlteSaison.starts_on);
  }
  if (gewaehlteSaison?.ends_on) {
    q = q.lte("starts_at", `${gewaehlteSaison.ends_on}T23:59:59Z`);
  }
  const { data: ergData } = await q;
  const ergebnisseJeTeam = new Map<string, EventRow[]>();
  for (const ev of ((ergData as EventRow[]) ?? [])) {
    const key = ev.team_id ?? "verein";
    const list = ergebnisseJeTeam.get(key) ?? [];
    list.push(ev);
    ergebnisseJeTeam.set(key, list);
  }

  // Bei archivierten Saisons: damalige Liga aus dem Archiv anzeigen
  const archivLiga = new Map<string, string>();
  if (gewaehlteSaison?.status === "archived") {
    const { data: archivData } = await supabase
      .from("season_team_archive")
      .select("team_name, league")
      .eq("season_id", gewaehlteSaison.id);
    for (const a of archivData ?? []) {
      if (a.league) archivLiga.set(a.team_name as string, a.league as string);
    }
  }

  const ergebnisText = (result: string): string => {
    const t = ergebnisTone(result);
    const zeichen = t === "ok" ? "✅" : t === "danger" ? "❌" : "➖";
    return `${zeichen} ${result}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="🎯 Ergebnisse"
        subtitle="Alle Spiele je Mannschaft – Spiel antippen für Details"
      />

      {/* Saison wählen */}
      {saisons.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {saisons.map((s) => (
            <Link
              key={s.id}
              href={`/mitglieder/ergebnisse?saison=${s.id}`}
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                gewaehlteSaison?.id === s.id
                  ? "bg-primary text-primary-fg"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {s.name}
              {s.status === "archived" ? " 🗂" : ""}
            </Link>
          ))}
        </div>
      )}

      {/* Saison-Rückblick (bei abgeschlossenen Saisons) */}
      {gewaehlteSaison?.status === "archived" &&
        (() => {
          const rows = ((ergData as EventRow[]) ?? []).map((ev) => ({
            id: ev.id,
            title: ev.title,
            starts_at: ev.starts_at,
            result: ev.result ?? null,
            match_stats: ev.match_stats,
          }));
          const spieler = vereinsAggregat(rows);
          if (spieler.length === 0) return null;
          const meiste180 = [...spieler].sort(
            (a, b) => b.anzahl180 - a.anzahl180,
          )[0];
          const besterFinish = [...spieler]
            .filter((s) => s.besterFinish !== null)
            .sort((a, b) => (b.besterFinish ?? 0) - (a.besterFinish ?? 0))[0];
          const kuerzestesLeg = [...spieler]
            .filter((s) => s.besterLowDarts !== null)
            .sort(
              (a, b) => (a.besterLowDarts ?? 99) - (b.besterLowDarts ?? 99),
            )[0];
          const besteBilanz = spieler[0];
          return (
            <Einklappbar
              id={`rueckblick-${gewaehlteSaison.id}`}
              title={`🏆 Saison-Rückblick ${gewaehlteSaison.name}`}
            >
              <ul className="space-y-1.5 text-sm">
                {besteBilanz && (
                  <li>
                    🥇 <strong>Beste Bilanz:</strong> {besteBilanz.anzeige} (
                    {besteBilanz.einzelSiege + besteBilanz.doppelSiege} Siege,{" "}
                    {besteBilanz.einzelNiederlagen +
                      besteBilanz.doppelNiederlagen}{" "}
                    Niederlagen)
                  </li>
                )}
                {meiste180 && meiste180.anzahl180 > 0 && (
                  <li>
                    💯 <strong>180er-König:</strong> {meiste180.anzeige} (
                    {meiste180.anzahl180}× 180)
                  </li>
                )}
                {besterFinish && (
                  <li>
                    🎯 <strong>Höchstes Highfinish:</strong>{" "}
                    {besterFinish.anzeige} ({besterFinish.besterFinish})
                  </li>
                )}
                {kuerzestesLeg && (
                  <li>
                    ⚡ <strong>Kürzestes Leg:</strong> {kuerzestesLeg.anzeige}{" "}
                    ({kuerzestesLeg.besterLowDarts} Darts)
                  </li>
                )}
                <li className="pt-1 text-xs text-muted">
                  Alle Zahlen unter „Statistiken“ (Saison{" "}
                  {gewaehlteSaison.name} auswählen).
                </li>
              </ul>
            </Einklappbar>
          );
        })()}

      <section className="space-y-4">
        {teams.length === 0 ? (
          <EmptyState title="Noch keine Mannschaften angelegt" />
        ) : (
          [
            ...teams.map((t) => ({
              id: t.id,
              name: t.name,
              league: t.league,
            })),
            {
              id: "verein",
              name: "🏆 Pokal & Vereins-Spiele",
              league: null as string | null,
            },
          ].map((t) => {
            const liste = ergebnisseJeTeam.get(t.id) ?? [];
            if (t.id === "verein" && liste.length === 0) return null;
            const liga = archivLiga.get(t.name) || t.league;
            const runden = teileInRunden(liste);
            const gruppen = [
              { titel: "Hinrunde", spiele: runden.hinrunde },
              { titel: "Rückrunde", spiele: runden.rueckrunde },
              {
                titel: "Pokal & Freundschaftsspiele",
                spiele: runden.sonstige,
              },
            ].filter((g) => g.spiele.length > 0);
            return (
              <Einklappbar
                key={t.id}
                id={`ergebnisse-${t.id}`}
                title={
                  <span>
                    {t.name}
                    {liga && (
                      <span className="ml-2 text-sm font-normal text-muted">
                        {liga}
                      </span>
                    )}
                    <span className="ml-2 text-sm font-normal text-muted">
                      · {liste.length} Spiele
                    </span>
                  </span>
                }
              >
                {liste.length === 0 ? (
                  <p className="text-sm text-muted">
                    In dieser Saison noch keine gespielten Spiele.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {(() => {
                      const b = teamBilanz(liste);
                      if (b.gesamt.s + b.gesamt.u + b.gesamt.n === 0) {
                        return null;
                      }
                      return (
                        <p className="rounded-lg bg-border/20 px-3 py-2 text-sm">
                          <strong>
                            Bilanz {b.gesamt.s}-{b.gesamt.u}-{b.gesamt.n}
                          </strong>{" "}
                          <span className="text-muted">
                            (S-U-N)
                            {b.heim.s + b.heim.u + b.heim.n + b.ausw.s +
                              b.ausw.u + b.ausw.n > 0 && (
                              <>
                                {" "}· Heim {b.heim.s}-{b.heim.u}-{b.heim.n} ·
                                Auswärts {b.ausw.s}-{b.ausw.u}-{b.ausw.n}
                              </>
                            )}
                            {b.serieText && <> · {b.serieText}</>}
                          </span>
                        </p>
                      );
                    })()}
                    {gruppen.map((gruppe) => (
                      <div key={gruppe.titel} className="space-y-1">
                        <p className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                          {gruppe.titel}
                        </p>
                        {gruppe.spiele.map((ev) => (
                          <Link
                            key={ev.id}
                            href={`/mitglieder/termine/${ev.id}`}
                            className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-border/30"
                          >
                            <span className="min-w-0">
                              <span className="text-muted">
                                {formatDate(ev.starts_at)}
                              </span>{" "}
                              {ev.title}
                              {ev.type !== "match" && (
                                <span className="ml-1 text-xs text-muted">
                                  ({EVENT_TYPE_LABELS[ev.type]})
                                </span>
                              )}
                            </span>
                            {(ev.result ?? "").trim() ? (
                              <Badge
                                tone={ergebnisTone((ev.result ?? "").trim())}
                              >
                                {ergebnisText((ev.result ?? "").trim())}
                              </Badge>
                            ) : (
                              <Badge>Ergebnis folgt</Badge>
                            )}
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </Einklappbar>
            );
          })
        )}
      </section>
    </div>
  );
}
