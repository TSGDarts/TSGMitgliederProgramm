import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import {
  sammleVereinsStatistikSaisons,
  sammleLigaStatistikSaisons,
  sammleDoppelPaareSaisons,
} from "@/lib/statistik";
import { LigaStatistikKacheln } from "@/components/LigaStatistik";
import { Bestenliste } from "@/components/Bestenliste";
import { SpielerVergleich } from "@/components/SpielerVergleich";
import { DoppelPaare } from "@/components/DoppelPaare";
import { ErfolgeListe } from "@/components/ErfolgeListe";
import { Einklappbar } from "@/components/Einklappbar";
import { PageHeader, EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Statistiken" };

export default async function StatistikenPage({
  searchParams,
}: {
  searchParams: Promise<{ spieler?: string; tab?: string }>;
}) {
  await requireProfile();
  const { spieler, tab } = await searchParams;
  const zeigeVergleich = tab === "vergleich";
  const zeigeDoppel = tab === "doppel";

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
          <>
            <LigaStatistikKacheln saisons={saisons} />
            <Einklappbar id="spieler-erfolge" title="🏅 Erfolge">
              <ErfolgeListe statistik={saisons[0].statistik} />
            </Einklappbar>
          </>
        )}
      </div>
    );
  }

  const saisonListen = await sammleVereinsStatistikSaisons();
  const doppelListen = zeigeDoppel ? await sammleDoppelPaareSaisons() : [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="📊 Statistiken"
        subtitle="Vereinsweite Liga-Statistik – Spieler antippen für alle Details"
      />

      {/* Reiter: Bestenliste / Vergleich */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/mitglieder/statistiken"
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            !zeigeVergleich && !zeigeDoppel
              ? "bg-primary text-primary-fg"
              : "border border-border text-muted hover:text-foreground"
          }`}
        >
          🏆 Bestenliste
        </Link>
        <Link
          href="/mitglieder/statistiken?tab=vergleich"
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            zeigeVergleich
              ? "bg-primary text-primary-fg"
              : "border border-border text-muted hover:text-foreground"
          }`}
        >
          ⚖️ Vergleich
        </Link>
        <Link
          href="/mitglieder/statistiken?tab=doppel"
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            zeigeDoppel
              ? "bg-primary text-primary-fg"
              : "border border-border text-muted hover:text-foreground"
          }`}
        >
          👥 Doppel-Paare
        </Link>
      </div>

      {saisonListen[0].liste.length === 0 ? (
        <EmptyState
          title="Noch keine Spielberichte eingespielt"
          hint="Sobald der Admin nuLiga-Spielberichte einspielt, füllt sich die Liste automatisch."
        />
      ) : zeigeDoppel ? (
        <Einklappbar id="statistiken-doppel" title="👥 Doppel-Paare-Bilanz">
          {doppelListen.length === 0 || doppelListen[0].liste.length === 0 ? (
            <p className="text-sm text-muted">
              Noch keine Doppel in den Spielberichten erfasst.
            </p>
          ) : (
            <DoppelPaare saisons={doppelListen} />
          )}
        </Einklappbar>
      ) : zeigeVergleich ? (
        <Einklappbar id="statistiken-vergleich" title="⚖️ Spieler vergleichen">
          <SpielerVergleich saisons={saisonListen} />
        </Einklappbar>
      ) : (
        <Einklappbar id="statistiken-bestenliste" title="🏆 Bestenliste">
          <Bestenliste saisons={saisonListen} />
        </Einklappbar>
      )}
    </div>
  );
}
