import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";
import {
  saveMailEinstellungen,
  saveFragenEinstellungen,
  testMailAction,
} from "./actions";
import { Einklappbar } from "@/components/Einklappbar";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  inputClass,
} from "@/components/ui";

export const metadata: Metadata = { title: "Einstellungen" };

export default async function AdminEinstellungenPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; gespeichert?: string; test?: string }>;
}) {
  await requireAdmin();
  const { fehler, gespeichert, test } = await searchParams;

  // Aktuelle Werte (der geheime Schlüssel wird nie angezeigt)
  let tenant = "";
  let client = "";
  let absender = "";
  let secretGesetzt = false;
  let ablauf = "";
  let fragenEmail = "";
  let fragenWhatsapp = "";
  try {
    const admin = createAdminSupabase();
    const { data } = await admin
      .from("secure_settings")
      .select("key, value")
      .in("key", [
        "graph_tenant_id",
        "graph_client_id",
        "graph_client_secret",
        "graph_absender",
        "graph_secret_ablauf",
      ]);
    for (const row of data ?? []) {
      const wert = (row.value as string) ?? "";
      if (row.key === "graph_tenant_id") tenant = wert;
      if (row.key === "graph_client_id") client = wert;
      if (row.key === "graph_absender") absender = wert;
      if (row.key === "graph_client_secret") secretGesetzt = !!wert;
      if (row.key === "graph_secret_ablauf") ablauf = wert;
    }
    const { data: appData } = await admin
      .from("app_settings")
      .select("key, value")
      .in("key", ["fragen_email", "fragen_whatsapp"]);
    for (const row of appData ?? []) {
      if (row.key === "fragen_email") fragenEmail = (row.value as string) ?? "";
      if (row.key === "fragen_whatsapp")
        fragenWhatsapp = (row.value as string) ?? "";
    }
  } catch {
    // Tabelle fehlt noch – Formular zeigt dann leere Felder
  }

  // Warnung anzeigen, wenn der Schlüssel bald abläuft oder abgelaufen ist
  let ablaufWarnung: string | null = null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ablauf)) {
    const heute = new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const tageBis = Math.round((Date.parse(ablauf) - Date.parse(heute)) / 864e5);
    if (tageBis < 0) {
      ablaufWarnung = `Der geheime Clientschlüssel ist am ${formatDate(ablauf)} abgelaufen – der E-Mail-Versand funktioniert nicht mehr. Bitte in Entra erneuern und hier neu eintragen.`;
    } else if (tageBis <= 30) {
      ablaufWarnung = `Der geheime Clientschlüssel läuft ${
        tageBis === 0 ? "HEUTE" : tageBis === 1 ? "morgen" : `in ${tageBis} Tagen`
      } ab (${formatDate(ablauf)}). Bitte rechtzeitig in Entra erneuern und hier neu eintragen.`;
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader
        title="Einstellungen"
        subtitle="Technische Einstellungen – nur für Admins"
      />

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody>
            <p className="font-semibold text-danger">⚠️ Fehler</p>
            <p className="mt-1 text-sm">{fehler}</p>
          </CardBody>
        </Card>
      ) : null}

      {gespeichert ? (
        <Card className="border-ok/40 bg-ok/10">
          <CardBody className="font-semibold text-ok">✓ Gespeichert.</CardBody>
        </Card>
      ) : null}

      {test ? (
        <Card className="border-ok/40 bg-ok/10">
          <CardBody className="font-semibold text-ok">✅ {test}</CardBody>
        </Card>
      ) : null}

      {ablaufWarnung ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody className="text-sm">⚠️ {ablaufWarnung}</CardBody>
        </Card>
      ) : null}

      <Einklappbar
        id="einstellungen-mail"
        title="📧 E-Mail-Versand (Microsoft 365)"
        zuklappBei={gespeichert?.startsWith("mail-") ? gespeichert : undefined}
      >
        <div className="space-y-4">
          <div>
            <p className="text-sm text-muted">
              Benachrichtigungen werden über euer Microsoft-365-Postfach
              verschickt (Modern Auth). Der geheime Schlüssel wird sicher
              gespeichert und ist für Mitglieder nicht einsehbar.
            </p>
            <p className="mt-1 text-sm text-muted">
              <strong>Benötigte Berechtigung in Microsoft Entra:</strong>{" "}
              Microsoft Graph → <strong>Mail.Send</strong> als{" "}
              <strong>Anwendungsberechtigung</strong> inkl.{" "}
              <strong>Administratorzustimmung</strong> – Schritt für Schritt
              in der Anleitung unten.
            </p>
          </div>
          <form action={saveMailEinstellungen} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Verzeichnis-ID (Mandant)">
                <input
                  name="tenant"
                  defaultValue={tenant}
                  placeholder="xxxxxxxx-xxxx-…"
                  className={inputClass}
                />
              </Field>
              <Field label="Anwendungs-ID (Client)">
                <input
                  name="client"
                  defaultValue={client}
                  placeholder="xxxxxxxx-xxxx-…"
                  className={inputClass}
                />
              </Field>
              <Field
                label="Geheimer Clientschlüssel (Wert)"
                hint={
                  secretGesetzt
                    ? "✓ Gespeichert – zum Ändern neuen Wert eingeben, sonst leer lassen"
                    : "Der WERT des Schlüssels (nur einmal sichtbar in Entra)"
                }
              >
                <input
                  name="secret"
                  type="password"
                  autoComplete="off"
                  placeholder={secretGesetzt ? "••••••••" : ""}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Absender-Adresse"
                hint="Das M365-Postfach, von dem gesendet wird"
              >
                <input
                  name="absender"
                  type="email"
                  defaultValue={absender}
                  placeholder="darts@tsg08roth.de"
                  className={inputClass}
                />
              </Field>
              <Field
                label="Schlüssel gültig bis"
                hint="Ablaufdatum des Schlüssels aus Entra – Admins werden 30, 14, 7, 3 und 1 Tag vorher benachrichtigt"
              >
                <input
                  name="ablauf"
                  type="date"
                  defaultValue={ablauf}
                  className={inputClass}
                />
              </Field>
            </div>
            <Button type="submit">Speichern</Button>
          </form>
          <form action={testMailAction}>
            <Button type="submit" variant="secondary">
              ✉️ Test-E-Mail an mich senden
            </Button>
          </form>
        </div>
      </Einklappbar>

      <Einklappbar
        id="einstellungen-fragen"
        title="❓ Fragen weiterleiten"
        zuklappBei={gespeichert?.startsWith("fragen-") ? gespeichert : undefined}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Bei jedem Beitrag unter „Fragen &amp; Feedback“ erscheinen
            Knöpfe, mit denen Mitglieder ihn direkt per E-Mail oder WhatsApp
            an den Verein schicken können. Hier festlegen, wohin – leere
            Felder blenden den jeweiligen Knopf aus.
          </p>
          <form action={saveFragenEinstellungen} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="E-Mail-Adresse"
                hint="Empfänger für „Per E-Mail senden“"
              >
                <input
                  name="email"
                  type="email"
                  defaultValue={fragenEmail}
                  placeholder="dart@tsg08roth.de"
                  className={inputClass}
                />
              </Field>
              <Field
                label="WhatsApp-Nummer"
                hint="Mit Vorwahl, z. B. 0170 1234567 oder +49 170 1234567"
              >
                <input
                  name="whatsapp"
                  type="tel"
                  defaultValue={fragenWhatsapp}
                  placeholder="+49 170 1234567"
                  className={inputClass}
                />
              </Field>
            </div>
            <Button type="submit">Speichern</Button>
          </form>
        </div>
      </Einklappbar>

      <Einklappbar
        id="einstellungen-m365-anleitung"
        title="📖 Anleitung: Werte in Microsoft 365 anlegen"
        defaultOpen={false}
      >
        <ol className="list-inside list-decimal space-y-2 text-sm text-muted">
          <li>
            <strong>entra.microsoft.com</strong> mit einem Admin-Konto öffnen
            → Identität → Anwendungen → <strong>App-Registrierungen</strong> →
            „Neue Registrierung“ (Name z. B. „TSG Mitglieder-App
            Mailversand“, Kontotyp „Nur Konten in diesem
            Organisationsverzeichnis“).
          </li>
          <li>
            Auf der Übersichtsseite die <strong>Anwendungs-ID (Client)</strong>{" "}
            und die <strong>Verzeichnis-ID (Mandant)</strong> kopieren → oben
            eintragen.
          </li>
          <li>
            <strong>Berechtigungen setzen:</strong> „API-Berechtigungen“ →
            „Berechtigung hinzufügen“ → <strong>Microsoft Graph</strong> →{" "}
            <strong>Anwendungsberechtigungen</strong> (wichtig: NICHT
            „Delegierte Berechtigungen“!) → in der Suche{" "}
            <strong>Mail.Send</strong> eintippen → Haken setzen →
            „Berechtigungen hinzufügen“.
            <ul className="mt-1 list-inside list-disc space-y-1 pl-4">
              <li>
                Danach auf{" "}
                <strong>
                  „Administratorzustimmung für &lt;Organisation&gt; erteilen“
                </strong>{" "}
                klicken – in der Spalte „Status“ muss bei Mail.Send ein{" "}
                <strong>grüner Haken „Gewährt“</strong> stehen, sonst lehnt
                Microsoft den Versand ab (Fehler 403).
              </li>
              <li>
                Mehr braucht die App nicht: <strong>nur Mail.Send</strong>.
                Die automatisch eingetragene Berechtigung „User.Read
                (Delegiert)“ kann einfach stehen bleiben.
              </li>
              <li>
                Hinweis: Mail.Send als Anwendungsberechtigung erlaubt der App
                technisch den Versand über jedes Postfach der Organisation.
                Wer das einschränken will, kann in Exchange Online eine
                „Application Access Policy“ auf das Absender-Postfach setzen –
                für den Vereinsbetrieb aber nicht zwingend nötig.
              </li>
            </ul>
          </li>
          <li>
            „Zertifikate &amp; Geheimnisse“ → „Neuer geheimer
            Clientschlüssel“ (z. B. 24 Monate) → den <strong>WERT</strong>{" "}
            sofort kopieren (nur einmal sichtbar!) → oben als Schlüssel
            eintragen. Das dort angezeigte <strong>Ablaufdatum</strong> oben
            im Feld „Schlüssel gültig bis“ eintragen – die App erinnert alle
            Admins dann automatisch 30, 14, 7, 3 und 1 Tag vor dem Ablauf.
          </li>
          <li>
            Absender-Adresse eintragen, speichern und mit{" "}
            <strong>„Test-E-Mail an mich senden“</strong> prüfen.
          </li>
        </ol>
      </Einklappbar>
    </div>
  );
}
