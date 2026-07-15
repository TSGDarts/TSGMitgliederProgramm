"use client";

import { useActionState, useState } from "react";
import { claimMember, type ClaimResult } from "./actions";
import { Button, Field, inputClass } from "@/components/ui";
import type { UnclaimedInvite } from "@/lib/invites";

export function ClaimForm({
  token,
  invites,
}: {
  token: string;
  invites: UnclaimedInvite[];
}) {
  const [state, formAction, pending] = useActionState<
    ClaimResult | null,
    FormData
  >(claimMember, null);
  const [selected, setSelected] = useState("");

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      {state && !state.ok && (
        <p className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.message}
        </p>
      )}

      <div>
        <span className="mb-2 block text-sm font-medium">
          1. Wer bist du? Wähle deinen Namen:
        </span>
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {invites.map((inv) => (
            <label
              key={inv.id}
              className={`flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm ${
                selected === inv.id
                  ? "bg-primary text-primary-fg"
                  : "hover:bg-border/40"
              }`}
            >
              <input
                type="radio"
                name="invite_id"
                value={inv.id}
                checked={selected === inv.id}
                onChange={() => setSelected(inv.id)}
                className="sr-only"
              />
              {inv.full_name}
            </label>
          ))}
        </div>
      </div>

      <Field
        label="2. Deine E-Mail-Adresse"
        hint="Damit meldest du dich künftig an und kannst dein Passwort zurücksetzen."
      >
        <input name="email" type="email" required className={inputClass} />
      </Field>

      <Field label="3. Dein Geburtstag">
        <input name="birthday" type="date" required className={inputClass} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="birthday_public" defaultChecked />
        Meinen Geburtstag im Mitglieder-Kalender anzeigen 🎂
      </label>
      <p className="-mt-3 text-xs text-muted">
        Nur für eingeloggte Mitglieder sichtbar – niemals öffentlich. Du kannst
        das jederzeit in deinem Profil ändern.
      </p>

      <Field label="4. Passwort festlegen" hint="Mindestens 8 Zeichen">
        <input
          name="password"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>
      <Field label="Passwort wiederholen">
        <input
          name="password2"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <Button type="submit" className="w-full" disabled={pending || !selected}>
        {pending ? "Wird angelegt …" : "Anmelden & loslegen"}
      </Button>
    </form>
  );
}
