import type { Metadata } from "next";
import { site } from "@/lib/site";
import { PageHeader, Card, CardBody } from "@/components/ui";

export const metadata: Metadata = { title: "Kontakt" };

export default function KontaktPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Kontakt" subtitle={site.fullName} />
      <Card>
        <CardBody className="space-y-3">
          <div>
            <div className="text-sm text-muted">Abteilung</div>
            <div className="font-medium">
              {site.clubName} – {site.section}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted">E-Mail</div>
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-medium text-primary hover:underline"
            >
              {site.contactEmail}
            </a>
          </div>
          <p className="pt-2 text-sm text-muted">
            Fragen zur Mannschaft oder Interesse am Mitspielen? Schreib uns
            einfach – wir freuen uns über jede Verstärkung.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
