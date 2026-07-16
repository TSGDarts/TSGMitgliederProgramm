import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import {
  sammleVereinsStatistik,
  sammleLigaStatistikSaisons,
} from "@/lib/statistik";
import { LigaStatistikKacheln } from "@/components/LigaStatistik";
import { Einklappbar } from "@/components/Einklappbar";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Statistiken" };

export default async function StatistikenPage({
  searchParams,
}: {
  searchParams: Promise<{ spieler?: string }>;
}) {
  await requireProfile();
  const { spieler } = await searchParams;

  // Detail-Ansicht einer Person (gleiche Kacheln wie im eigenen Profil)
  if (spieler) {
    const saisons = await sammleLigaStatistikSaisons(spieler);
    return (
      <div className="space-y-6">
        <Link
          href="/mitglieder/statistiken"
          className="text-sm text-primary hover:underline"
        >
          ← Alle Spieler
        </Link>
        <PageHeader
          title={`📊 ${spieler}`}
          subtitle="Liga-Statistik aus den eingespielten nuLiga-Spielberichten"
        />
        {saisons[0].statistik.spieltage === 0 ? (
          <EmptyState title="Für diese Person sind noch keine Spiele erfasst" />
        ) : (
          <LigaStatistikKacheln saisons={saisons} />
        )}
      </div>
    );
  }

  const liste = await sammleVereinsStatistik();
  return (
    <div className="space-y-6">
      <PageHeader
        title="📊 Statistiken"
        subtitle="Vereinsweite Liga-Statistik – Spieler antippen für alle Details"
      />

      <Einklappbar id="statistiken-bestenliste" title="🏆 Bestenliste">
        {liste.length === 0 ? (
          <EmptyState
            title="Noch keine Spielberichte eingespielt"
            hint="Sobald der Admin nuLiga-Spielberichte einspielt, füllt sich die Liste automatisch."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full whitespace-nowrap text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-2 py-2">#</th>
                  <th className="px-2 py-2">Spieler</th>
                  <th className="px-2 py-2">Spieltage</th>
                  <th className="px-2 py-2">Einzel</th>
                  <th className="px-2 py-2">Doppel</th>
                  <th className="px-2 py-2">Legs</th>
                  <th className="px-2 py-2">180er</th>
                  <th className="px-2 py-2">Bester Finish</th>
                  <th className="px-2 py-2">Kürzestes Leg</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((s, i) => (
                  <tr
                    key={s.anzeige}
                    className="border-b border-border/50 hover:bg-border/20"
                  >
                    <td className="px-2 py-2 text-muted">{i + 1}.</td>
                    <td className="px-2 py-2 font-medium">
                      <Link
                        href={`/mitglieder/statistiken?spieler=${encodeURIComponent(s.anzeige)}`}
                        className="text-primary hover:underline"
                      >
                        {s.anzeige}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{s.spieltage}</td>
                    <td className="px-2 py-2">
                      {s.einzelSiege}–{s.einzelNiederlagen}
                    </td>
                    <td className="px-2 py-2">
                      {s.doppelSiege}–{s.doppelNiederlagen}
                    </td>
                    <td className="px-2 py-2">
                      {s.legsGewonnen}:{s.legsVerloren}
                    </td>
                    <td className="px-2 py-2">{s.anzahl180}</td>
                    <td className="px-2 py-2">{s.besterFinish ?? "–"}</td>
                    <td className="px-2 py-2">{s.besterLowDarts ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              Sortiert nach Siegen (Einzel + Doppel), über alle Saisons.
            </p>
          </div>
        )}
      </Einklappbar>
    </div>
  );
}
