import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { PdfPan } from "@/components/PdfPan";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Rahmenterminplan" };

export default async function RahmenterminplanPage() {
  await requireProfile();

  return (
    <div className="space-y-6">
      <PageHeader
        title="📄 Rahmenterminplan 2026/27 & 2027/28"
        subtitle="Der offizielle Rahmenterminplan (Mittelfranken / BDV / DDV) – die Spielwochen stehen auch im Kalender"
      />

      <PdfPan
        src="/rahmenterminplan.pdf"
        titel="Rahmenterminplan 2026/27 & 2027/28"
        seiten={2}
      />

      <a
        href="/rahmenterminplan.pdf"
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-border/40"
      >
        📥 PDF öffnen / herunterladen
      </a>
    </div>
  );
}
