import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { updateProfile } from "./actions";
import { sammleLigaStatistik } from "@/lib/statistik";
import { LigaStatistikKacheln } from "@/components/LigaStatistik";
import { Einklappbar } from "@/components/Einklappbar";
import { PushSettings } from "@/components/PushSettings";
import {
  PageHeader,
  Card,
  CardBody,
  Button,
  Field,
  inputClass,
  Badge,
} from "@/components/ui";

export const metadata: Metadata = { title: "Mein Profil" };

// Erinnerungen: je Termin-Art wählbare Vorlaufzeiten (in Tagen)
const ERINNERUNG_ARTEN: { key: string; label: string }[] = [
  { key: "punktspiele", label: "🎯 Punktspiele (Liga)" },
  { key: "pokal", label: "🏆 Pokalspiele" },
  { key: "freundschaft", label: "🤝 Freundschaftsspiele" },
  { key: "training", label: "💪 Training" },
  { key: "feste", label: "🎉 Feste" },
  { key: "verein", label: "🏠 Vereinstermine (Sonstiges)" },
  { key: "turniere", label: "🏟 Turniere" },
];

export default async function ProfilPage({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; gespeichert?: string }>;
}) {
  const profile = await requireProfile();
  const { fehler, gespeichert } = await searchParams;
  const statistik = await sammleLigaStatistik(profile.full_name ?? "");

  return (
    <div className="max-w-lg space-y-6">
      <PageHeader title="Mein Profil" />

      {fehler ? (
        <Card className="border-danger/40 bg-danger/10">
          <CardBody>
            <p className="font-semibold text-danger">⚠️ Fehler beim Speichern</p>
            <p className="mt-1 text-sm">{fehler}</p>
          </CardBody>
        </Card>
      ) : null}

      {gespeichert ? (
        <Card className="border-ok/40 bg-ok/10">
          <CardBody className="font-semibold text-ok">✓ Gespeichert.</CardBody>
        </Card>
      ) : null}

      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-muted">
            <span>{profile.email}</span>
            {profile.role === "admin" && <Badge tone="primary">Admin</Badge>}
          </div>

          <form action={updateProfile} className="space-y-4">
            <Field label="Name">
              <input
                name="full_name"
                defaultValue={profile.full_name}
                required
                className={inputClass}
              />
            </Field>
            <Field
              label="Handynummer (optional)"
              hint="Ideal für WhatsApp-Abstimmungen im Team – für Mitspieler im Kader sichtbar"
            >
              <input
                name="phone"
                type="tel"
                defaultValue={profile.phone ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Geburtstag">
              <input
                name="birthday"
                type="date"
                required
                defaultValue={profile.birthday ?? ""}
                className={inputClass}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="birthday_public"
                defaultChecked={profile.birthday_public ?? false}
              />
              Meinen Geburtstag im Mitglieder-Kalender anzeigen 🎂
            </label>
            <p className="-mt-2 text-xs text-muted">
              Nur für eingeloggte Mitglieder sichtbar – niemals öffentlich oder
              in Datenübergaben an andere Programme.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="birthday_congrats"
                defaultChecked={profile.birthday_congrats ?? false}
              />
              Mir darf in der Mitgliedergruppe zum Geburtstag gratuliert
              werden 🎉
            </label>
            <Field
              label="Standard-Antwort für Trainings 💪"
              hint="Gilt automatisch, solange du bei einem Training nicht selbst geantwortet hast – z. B. „standardmäßig absagen“ und nur zusagen, wenn du kannst."
            >
              <select
                name="training_default_rsvp"
                defaultValue={profile.training_default_rsvp ?? ""}
                className={inputClass}
              >
                <option value="">keine Vorbelegung</option>
                <option value="yes">standardmäßig zusagen</option>
                <option value="maybe">standardmäßig „vielleicht“</option>
                <option value="no">standardmäßig absagen</option>
              </select>
            </Field>
            <div className="space-y-3 rounded-lg border border-border p-3">
              <p className="text-sm font-medium">🔔 Benachrichtigungen</p>
              <p className="text-xs text-muted">
                Benachrichtigungen (neue Termine, Aufstellungen, Erinnerungen)
                kommen als <strong>Push</strong> auf jedes Gerät, auf dem du
                Push unten aktiviert hast. Mit dem Haken bekommst du{" "}
                <strong>alles zusätzlich per E-Mail</strong>.
              </p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="notify_email"
                  defaultChecked={profile.notify_email ?? false}
                />
                ✉️ Alles zusätzlich per E-Mail erhalten
              </label>
              <p className="text-sm font-medium">⏰ Erinnerungen vor Terminen</p>
              <p className="text-xs text-muted">
                Gilt für Push <em>und</em> E-Mail: Trage je Termin-Art ein,
                wie viele <strong>Tage vorher</strong> du erinnert werden
                willst – mehrere Werte mit Komma trennen. Beispiel:{" "}
                <strong>„14, 7, 1“</strong> = eine Erinnerung 14 Tage, 7 Tage
                und 1 Tag vor dem Termin. Erlaubt sind 1–30 Tage; leer =
                keine Erinnerung.
              </p>
              <div className="space-y-1.5">
                {ERINNERUNG_ARTEN.map((art) => {
                  const gewaehlt =
                    (profile.notify_erinnerungen ?? {})[art.key] ?? [];
                  return (
                    <div
                      key={art.key}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
                    >
                      <span className="w-44">{art.label}</span>
                      <input
                        name={`erinnerung_${art.key}`}
                        defaultValue={[...gewaehlt]
                          .sort((a, b) => b - a)
                          .join(", ")}
                        placeholder="z. B. 14, 7, 1"
                        inputMode="numeric"
                        className="w-40 rounded-lg border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-primary"
                      />
                    </div>
                  );
                })}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="notify_trotz_zusage"
                  defaultChecked={profile.notify_trotz_zusage ?? true}
                />
                🔁 Auch erinnern, wenn ich schon zugesagt habe
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="notify_trotz_vielleicht"
                  defaultChecked={profile.notify_trotz_vielleicht ?? true}
                />
                🔁 Auch erinnern, wenn ich „Vielleicht“ gewählt habe
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="notify_trotz_absage"
                  defaultChecked={profile.notify_trotz_absage ?? false}
                />
                🔁 Auch erinnern, wenn ich schon abgesagt habe
              </label>
              <p className="text-xs text-muted">
                Ohne Haken bekommst du keine Erinnerung mehr zu Terminen, bei
                denen du die jeweilige Antwort gegeben hast. Wer noch gar
                nicht geantwortet hat, wird immer erinnert.
              </p>
            </div>
            <Button type="submit">Speichern</Button>
          </form>
        </CardBody>
      </Card>

      <Einklappbar id="profil-statistik" title="📊 Meine Liga-Statistik">
        {statistik.spieltage === 0 ? (
          <p className="text-sm text-muted">
            Noch keine Spielberichte mit dir erfasst. Sobald der Admin die
            nuLiga-Spielberichte einspielt, zählt hier alles automatisch
            zusammen.
          </p>
        ) : (
          <LigaStatistikKacheln statistik={statistik} />
        )}
      </Einklappbar>

      <Card>
        <CardBody className="space-y-2">
          <p className="font-medium">🔔 Push-Benachrichtigungen</p>
          <PushSettings />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="text-sm text-muted">
          <p className="mb-1 font-medium text-foreground">Passwort ändern</p>
          Du kannst dein Passwort jederzeit über die Seite{" "}
          <a href="/passwort-setzen" className="text-primary hover:underline">
            Passwort festlegen
          </a>{" "}
          neu setzen, solange du angemeldet bist.
        </CardBody>
      </Card>
    </div>
  );
}
