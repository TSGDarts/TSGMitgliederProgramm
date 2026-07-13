import Link from "next/link";
import type { Metadata } from "next";
import { signIn } from "./actions";
import { site } from "@/lib/site";
import { Card, CardBody, Button, Field, inputClass } from "@/components/ui";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ weiter?: string; fehler?: string; angemeldet?: string }>;
}) {
  const { weiter, fehler, angemeldet } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-6 flex items-center justify-center gap-2 font-bold"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-fg">
            🎯
          </span>
          <span>
            {site.clubName} {site.section}
          </span>
        </Link>

        <Card>
          <CardBody className="space-y-4">
            <div>
              <h1 className="text-lg font-bold">Mitglieder-Login</h1>
              <p className="text-sm text-muted">
                Melde dich mit deiner E-Mail-Adresse an.
              </p>
            </div>

            {angemeldet && (
              <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
                Dein Zugang wurde angelegt. Melde dich jetzt mit deiner E-Mail und
                deinem Passwort an.
              </p>
            )}
            {fehler === "login" && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                E-Mail oder Passwort ist falsch.
              </p>
            )}
            {fehler === "gesperrt" && (
              <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                Dein Zugang ist gesperrt. Bitte wende dich an den Verein.
              </p>
            )}
            {fehler === "link" && (
              <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
                Der Link ist ungültig oder abgelaufen. Bitte einen neuen anfordern.
              </p>
            )}
            {fehler === "setup" && (
              <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
                Die Datenbank ist noch nicht eingerichtet. Bitte Supabase-Zugang
                in <code>.env.local</code> hinterlegen.
              </p>
            )}

            <form action={signIn} className="space-y-4">
              <input type="hidden" name="next" value={weiter ?? "/mitglieder"} />
              <Field label="E-Mail">
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </Field>
              <Field label="Passwort">
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className={inputClass}
                />
              </Field>
              <Button type="submit" className="w-full">
                Anmelden
              </Button>
            </form>

            <p className="text-center text-xs text-muted">
              Noch kein Zugang? Der Zugang wird vom Vereins-Admin angelegt. Du
              bekommst dann einen Link, um dein Passwort selbst zu setzen.
            </p>
          </CardBody>
        </Card>

        <p className="mt-4 text-center text-sm">
          <Link href="/" className="text-muted hover:text-foreground">
            ← Zurück zur Startseite
          </Link>
        </p>
      </div>
    </div>
  );
}
