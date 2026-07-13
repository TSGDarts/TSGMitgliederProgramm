"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody, Button, Field, inputClass } from "@/components/ui";
import { site } from "@/lib/site";

export default function PasswortSetzenPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("Das Passwort muss mindestens 8 Zeichen lang sein.");
      setStatus("error");
      return;
    }
    if (password !== confirm) {
      setMessage("Die Passwörter stimmen nicht überein.");
      setStatus("error");
      return;
    }

    setStatus("saving");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("error");
      setMessage(
        "Konnte nicht gespeichert werden. Ist der Link noch gültig? Bitte den Admin um einen neuen Link bitten.",
      );
      return;
    }

    setStatus("done");
    setTimeout(() => router.push("/mitglieder"), 1200);
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center font-bold">
          {site.clubName} {site.section}
        </div>
        <Card>
          <CardBody className="space-y-4">
            <div>
              <h1 className="text-lg font-bold">Passwort festlegen</h1>
              <p className="text-sm text-muted">
                Lege jetzt dein persönliches Passwort fest. Danach kannst du dich
                immer damit anmelden.
              </p>
            </div>

            {message && (
              <p
                className={`rounded-lg px-3 py-2 text-sm ${
                  status === "error"
                    ? "bg-danger/10 text-danger"
                    : "bg-ok/10 text-ok"
                }`}
              >
                {message}
              </p>
            )}
            {status === "done" && (
              <p className="rounded-lg bg-ok/10 px-3 py-2 text-sm text-ok">
                Passwort gespeichert! Du wirst weitergeleitet …
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Neues Passwort" hint="Mindestens 8 Zeichen">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
              </Field>
              <Field label="Passwort wiederholen">
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
              </Field>
              <Button
                type="submit"
                className="w-full"
                disabled={status === "saving" || status === "done"}
              >
                {status === "saving" ? "Speichere …" : "Passwort speichern"}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
