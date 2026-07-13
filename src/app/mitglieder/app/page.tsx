import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { siteUrl } from "@/lib/supabase/config";
import { site } from "@/lib/site";
import { getOrCreateJoinToken } from "@/lib/invites";
import { ShareCard } from "./ShareCard";
import { PageHeader, Card, CardBody } from "@/components/ui";

export const metadata: Metadata = { title: "App & Teilen" };

function Step({ nr, children }: { nr: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg">
        {nr}
      </span>
      <span>{children}</span>
    </li>
  );
}

export default async function AppPage() {
  await requireProfile();

  // EIN Link für alles: Neue registrieren sich darüber (Namensauswahl),
  // wer schon einen Zugang hat, kommt über den Anmelden-Button hinein –
  // und wer eingeloggt ist, landet direkt in der App.
  let shareUrl = siteUrl;
  try {
    const token = await getOrCreateJoinToken();
    shareUrl = `${siteUrl}/beitreten?token=${token}`;
  } catch {
    // Ohne Service-Schlüssel (z. B. lokal): normale Adresse verwenden.
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="App & Teilen"
        subtitle="Hol dir die Seite als App aufs Handy und lade Mitspieler ein"
      />

      {/* Installations-Anleitungen (aufklappbar) */}
      <Card>
        <CardBody className="space-y-3">
          <div>
            <h2 className="font-semibold">Als App aufs Handy installieren</h2>
            <p className="text-sm text-muted">
              Danach startet {site.clubName} {site.section} mit eigenem
              🎯-Symbol vom Startbildschirm – wie eine normale App, ohne
              App-Store.
            </p>
          </div>

          <details className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-medium">
               iPhone / iPad (Safari)
              <span className="text-muted transition group-open:rotate-180">▾</span>
            </summary>
            <ol className="space-y-3 border-t border-border px-4 py-4 text-sm">
              <Step nr={1}>
                Öffne diese Seite im <strong>Safari</strong>-Browser (wichtig –
                aus WhatsApp heraus zuerst unten rechts auf das
                Safari-/Browser-Symbol tippen).
              </Step>
              <Step nr={2}>
                Tippe unten in der Mitte auf das <strong>Teilen-Symbol</strong>{" "}
                (Quadrat mit Pfeil nach oben).
              </Step>
              <Step nr={3}>
                Wähle in der Liste{" "}
                <strong>„Zum Home-Bildschirm hinzufügen“</strong> (evtl. etwas
                nach unten scrollen).
              </Step>
              <Step nr={4}>
                Oben rechts auf <strong>„Hinzufügen“</strong> tippen – fertig!
                Das 🎯-Symbol liegt jetzt auf deinem Home-Bildschirm.
              </Step>
            </ol>
          </details>

          <details className="group rounded-lg border border-border">
            <summary className="flex cursor-pointer items-center justify-between px-4 py-3 font-medium">
              🤖 Android (Chrome)
              <span className="text-muted transition group-open:rotate-180">▾</span>
            </summary>
            <ol className="space-y-3 border-t border-border px-4 py-4 text-sm">
              <Step nr={1}>
                Öffne diese Seite im <strong>Chrome</strong>-Browser.
              </Step>
              <Step nr={2}>
                Tippe oben rechts auf das <strong>Drei-Punkte-Menü ⋮</strong>.
              </Step>
              <Step nr={3}>
                Wähle <strong>„App installieren“</strong> bzw.{" "}
                <strong>„Zum Startbildschirm hinzufügen“</strong>.
              </Step>
              <Step nr={4}>
                Mit <strong>„Installieren“ / „Hinzufügen“</strong> bestätigen –
                fertig! Die App erscheint auf deinem Startbildschirm.
              </Step>
            </ol>
          </details>
        </CardBody>
      </Card>

      {/* Teilen */}
      <ShareCard
        url={shareUrl}
        title={`${site.clubName} ${site.section} – Vereins-App`}
      />

      <Card className="border-dashed">
        <CardBody className="text-sm text-muted">
          <strong className="text-foreground">Ein Link für alles:</strong> Wer
          den QR-Code scannt und <em>neu</em> ist, wählt seinen Namen und
          registriert sich selbst. Wer <em>schon einen Zugang</em> hat, tippt
          einfach auf „Anmelden“ – und wer bereits eingeloggt ist, landet
          direkt in der App.
        </CardBody>
      </Card>
    </div>
  );
}
