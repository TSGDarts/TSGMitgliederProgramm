import Link from "next/link";
import type { Metadata } from "next";
import { isValidJoinToken, listUnclaimedInvites } from "@/lib/invites";
import { ClaimForm } from "./ClaimForm";
import { Card, CardBody } from "@/components/ui";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Anmelden" };

export default async function BeitretenPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await isValidJoinToken(token) : false;
  const invites = valid ? await listUnclaimedInvites() : [];

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 font-bold">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-fg">
            🎯
          </span>
          <span>
            {site.clubName} {site.section}
          </span>
        </div>

        <Card>
          <CardBody className="space-y-4">
            <div>
              <h1 className="text-lg font-bold">Bei uns anmelden</h1>
              <p className="text-sm text-muted">
                Wähle deinen Namen und lege deinen Zugang an.
              </p>
            </div>

            {!valid ? (
              <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
                Dieser Anmelde-Link ist ungültig oder abgelaufen. Bitte wende dich
                an den Verein für einen aktuellen Link oder QR-Code.
              </p>
            ) : invites.length === 0 ? (
              <p className="rounded-lg bg-border/40 px-3 py-2 text-sm text-muted">
                Aktuell sind keine offenen Namen hinterlegt. Wenn dein Name fehlt,
                melde dich beim Verein.
              </p>
            ) : (
              <ClaimForm token={token!} invites={invites} />
            )}

            <p className="border-t border-border pt-3 text-center text-xs text-muted">
              Schon angemeldet?{" "}
              <Link href="/login" className="text-primary hover:underline">
                Hier einloggen
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
