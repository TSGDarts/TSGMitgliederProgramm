import type { Metadata } from "next";
import { requireJerseyReportViewer } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { JERSEY_SIZES, isJerseySize, jerseySizeLabel } from "@/lib/jersey";
import { TrikotgroessenTabelle } from "@/components/TrikotgroessenTabelle";
import { Badge, ButtonLink, Card, CardBody, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Trikotgrößen" };

type JerseyMember = {
  id: string;
  full_name: string;
  jersey_size: string | null;
  is_active: boolean;
};

function MemberSizes({ members }: { members: JerseyMember[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="bg-border/40">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Name</th>
            <th scope="col" className="px-4 py-3 font-semibold">Trikotgröße</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {members.map((member) => (
            <tr key={member.id}>
              <th scope="row" className="px-4 py-3 font-medium">
                {member.full_name || "Name fehlt"}
              </th>
              <td className="whitespace-nowrap px-4 py-3">
                {member.jersey_size ? (
                  isJerseySize(member.jersey_size) ? (
                    jerseySizeLabel(member.jersey_size)
                  ) : (
                    <Badge tone="warn">Angabe prüfen: {member.jersey_size}</Badge>
                  )
                ) : (
                  <Badge tone="warn">Noch offen</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function JerseyReportPage() {
  const profile = await requireJerseyReportViewer();

  // Der Service-Client darf erst nach der eigenen Berechtigungsprüfung lesen.
  // Es werden ausschließlich die für diese Auswertung benötigten Felder geladen.
  let members: JerseyMember[] | null = null;
  let surveyOpen: boolean | null = null;
  try {
    const admin = createAdminSupabase();
    const [membersResult, settingResult] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, jersey_size, is_active")
        .order("full_name"),
      admin
        .from("app_settings")
        .select("value")
        .eq("key", "jersey_survey_open")
        .maybeSingle(),
    ]);
    if (!membersResult.error && membersResult.data) {
      members = membersResult.data as JerseyMember[];
    }
    if (!settingResult.error && settingResult.data) {
      surveyOpen = settingResult.data.value === "true";
    }
  } catch {
    // Ladefehler bleiben unten sichtbar und werden nicht als leere Abfrage gezeigt.
  }

  const activeMembers = members?.filter((member) => member.is_active) ?? [];
  const formerMembers = members?.filter(
    (member) => !member.is_active && member.jersey_size,
  ) ?? [];
  const answered = activeMembers.filter(
    (member) => member.jersey_size && isJerseySize(member.jersey_size),
  ).length;
  const unanswered = activeMembers.filter((member) => !member.jersey_size).length;
  const invalid = activeMembers.length - answered - unanswered;

  return (
    <div className="space-y-6">
      <PageHeader
        title="👕 Trikotgrößen"
        subtitle="Auswertung der Angaben aller registrierten Mitglieder."
        action={profile.role === "admin" ? (
          <ButtonLink href="/mitglieder/admin/einstellungen" variant="secondary">
            Abfrage verwalten
          </ButtonLink>
        ) : undefined}
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">Trikotgrößen-Abfrage</h2>
            <Badge tone={surveyOpen === null ? "warn" : surveyOpen ? "ok" : "neutral"}>
              {surveyOpen === null ? "Status nicht verfügbar" : surveyOpen ? "offen" : "geschlossen"}
            </Badge>
          </div>
          <p className="text-sm text-muted">
            Die Übersicht ist für Admins und Mitglieder mit Freigabe zur
            Trikot-Auswertung sichtbar. Solange die Abfrage offen ist, können
            Mitglieder ihre eigene Größe unter „Mein Profil“ ändern.
          </p>
          <ButtonLink href="/mitglieder/profil#trikotgroesse" variant="secondary">
            Zur eigenen Trikotgröße
          </ButtonLink>
        </CardBody>
      </Card>

      {members === null ? (
        <div role="alert" className="rounded-lg bg-danger/10 p-4 text-danger">
          Die Trikotgrößen konnten nicht geladen werden. Bitte lade die Seite
          erneut. Es werden keine unvollständigen Summen angezeigt.
        </div>
      ) : (
        <>
          <Card>
            <CardBody className="space-y-4">
              <h2 className="text-lg font-bold">Mengen nach Größe</h2>
              <p className="text-sm text-muted">
                {answered} von {activeMembers.length} aktiven Mitgliedern haben
                eine gültige Größe eingetragen. Noch offen: {unanswered}.
                {invalid > 0 && ` Angaben zu prüfen: ${invalid}.`}
              </p>
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Trikotanzahl je Größe für aktive Mitglieder</caption>
                  <thead className="bg-border/40">
                    <tr>
                      <th scope="col" className="px-4 py-2 font-semibold">Größe</th>
                      <th scope="col" className="px-4 py-2 text-right font-semibold">Anzahl</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {JERSEY_SIZES.map((size) => (
                      <tr key={size}>
                        <th scope="row" className="px-4 py-2 font-medium">{jerseySizeLabel(size)}</th>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {activeMembers.filter((member) => member.jersey_size === size).length}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border bg-border/40 font-semibold">
                    <tr>
                      <th scope="row" className="px-4 py-2">Gesamt mit Größe</th>
                      <td className="px-4 py-2 text-right tabular-nums">{answered}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardBody>
          </Card>

          <Card className="overflow-hidden">
            <CardBody>
              <h2 className="text-lg font-bold">Aktive Mitglieder ({activeMembers.length})</h2>
              <p className="mt-1 text-sm text-muted">Alle Angaben, einschließlich noch fehlender Größen.</p>
            </CardBody>
            {activeMembers.length > 0 ? (
              <MemberSizes members={activeMembers} />
            ) : (
              <p className="px-5 pb-5 text-sm text-muted">Keine aktiven Mitglieder vorhanden.</p>
            )}
          </Card>

          {formerMembers.length > 0 && (
            <Card className="overflow-hidden">
              <CardBody>
                <h2 className="text-lg font-bold">Ehemalige Mitglieder mit Angabe ({formerMembers.length})</h2>
                <p className="mt-1 text-sm text-muted">Diese Größen sind in den Mengen oben nicht enthalten.</p>
              </CardBody>
              <MemberSizes members={formerMembers} />
            </Card>
          )}
        </>
      )}

      <TrikotgroessenTabelle />
    </div>
  );
}
