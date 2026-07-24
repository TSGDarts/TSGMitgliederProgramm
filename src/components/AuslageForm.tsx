"use client";

import { useActionState } from "react";
import { reichAuslageEin, type Res } from "@/app/mitglieder/kasse/actions";
import { KasseUpload } from "@/components/KasseUpload";
import { Button, Field, inputClass } from "@/components/ui";

/** Formular: Auslage/Beleg zur Erstattung einreichen (jedes Mitglied). */
export function AuslageForm() {
  const [state, formAction, pending] = useActionState<Res | null, FormData>(
    reichAuslageEin,
    null,
  );

  return (
    <form action={formAction} className="space-y-4" key={state?.ok ? "neu" : "form"}>
      {state && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Wofür? *" hint="z. B. Weizen fürs Heimspiel">
          <input name="titel" required className={inputClass} />
        </Field>
        <Field label="Betrag (€) *">
          <input
            name="betrag"
            inputMode="decimal"
            placeholder="z. B. 24,90"
            required
            className={inputClass}
          />
        </Field>
        <Field label="Datum des Belegs">
          <input name="datum" type="date" className={inputClass} />
        </Field>
        <Field label="IBAN für die Überweisung" hint="Wohin soll erstattet werden?">
          <input name="iban" className={inputClass} placeholder="DE.." />
        </Field>
      </div>
      <Field label="Notiz (optional)">
        <textarea name="zweck" rows={2} className={inputClass} />
      </Field>
      <Field label="Foto/Scan vom Beleg" hint="Bild oder PDF, max. 15 MB">
        <KasseUpload folder="auslagen" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Wird eingereicht …" : "Auslage einreichen"}
      </Button>
    </form>
  );
}
