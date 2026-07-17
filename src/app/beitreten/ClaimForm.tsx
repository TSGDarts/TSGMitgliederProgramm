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
  const [suche, setSuche] = useState("");
  // Alle Eingaben als React-Zustand: so bleiben sie erhalten, wenn das
  // Speichern fehlschlägt (z. B. Passwort zu kurz) – das Formular wird
  // nach dem Absenden sonst automatisch geleert.
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [birthdayPublic, setBirthdayPublic] = useState(true);
  const [birthdayCongrats, setBirthdayCongrats] = useState(true);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const treffer = suche.trim()
    ? invites.filter((inv) =>
        inv.full_name.toLowerCase().includes(suche.trim().toLowerCase()),
      )
    : invites;

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
        <input
          type="search"
          value={suche}
          onChange={(e) => setSuche(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          placeholder="🔍 Namen suchen …"
          className={`${inputClass} mb-2`}
        />
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-1">
          {treffer.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted">
              Kein Name gefunden – Suche anpassen oder beim Verein melden.
            </p>
          ) : (
            treffer.map((inv) => (
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
            ))
          )}
        </div>
        {selected && !treffer.some((inv) => inv.id === selected) && (
          <p className="mt-1 text-xs text-muted">
            ✓ Ausgewählt:{" "}
            {invites.find((inv) => inv.id === selected)?.full_name} (bleibt
            auch bei anderer Suche gewählt)
          </p>
        )}
      </div>

      {/* Auswahl auch mitsenden, wenn der Name gerade weggefiltert ist */}
      {selected && !treffer.some((inv) => inv.id === selected) && (
        <input type="hidden" name="invite_id" value={selected} />
      )}

      <Field
        label="2. Deine E-Mail-Adresse"
        hint="Damit meldest du dich künftig an und kannst dein Passwort zurücksetzen."
      >
        <input
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field
        label="3. Handynummer (optional)"
        hint="Ideal für WhatsApp-Abstimmungen im Team – kein Pflichtfeld."
      >
        <input
          name="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="4. Dein Geburtstag" hint="Pflichtfeld – brauchen wir für die Liga-Meldung.">
        <input
          name="birthday"
          type="date"
          required
          value={birthday}
          onChange={(e) => setBirthday(e.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="birthday_public"
          checked={birthdayPublic}
          onChange={(e) => setBirthdayPublic(e.target.checked)}
        />
        Meinen Geburtstag im Mitglieder-Kalender anzeigen 🎂
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="birthday_congrats"
          checked={birthdayCongrats}
          onChange={(e) => setBirthdayCongrats(e.target.checked)}
        />
        Mir darf in der Mitgliedergruppe zum Geburtstag gratuliert werden 🎉
      </label>
      <p className="-mt-3 text-xs text-muted">
        Nur für eingeloggte Mitglieder sichtbar – niemals öffentlich. Du kannst
        beides jederzeit in deinem Profil ändern.
      </p>

      <Field label="5. Passwort festlegen" hint="Mindestens 8 Zeichen">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Passwort wiederholen">
        <input
          name="password2"
          type="password"
          required
          autoComplete="new-password"
          value={password2}
          onChange={(e) => setPassword2(e.target.value)}
          className={inputClass}
        />
      </Field>
      {password2.length > 0 && password !== password2 && (
        <p className="-mt-3 text-xs text-danger">
          Die Passwörter stimmen noch nicht überein.
        </p>
      )}

      <Button
        type="submit"
        className="w-full"
        disabled={pending || !selected || (password2.length > 0 && password !== password2)}
      >
        {pending ? "Wird angelegt …" : "Anmelden & loslegen"}
      </Button>
    </form>
  );
}
