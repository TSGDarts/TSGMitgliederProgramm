"use client";

import { useActionState } from "react";
import { saveBeleg, type Res } from "@/app/mitglieder/kasse/actions";
import { KasseUpload } from "@/components/KasseUpload";
import { Button, Field, inputClass } from "@/components/ui";

/** Beleg/Rechnung (3k, BDV …) ablegen – nur Kassierer. */
export function BelegForm() {
  const [state, formAction, pending] = useActionState<Res | null, FormData>(
    saveBeleg,
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
        <Field label="Titel *" hint="z. B. 3k Software Jahreslizenz">
          <input name="titel" required className={inputClass} />
        </Field>
        <Field label="Empfänger/Firma">
          <input name="empfaenger" className={inputClass} />
        </Field>
        <Field label="Betrag (€)">
          <input name="betrag" inputMode="decimal" className={inputClass} />
        </Field>
        <Field label="Datum">
          <input name="datum" type="date" className={inputClass} />
        </Field>
        <Field label="Kategorie">
          <input
            name="kategorie"
            placeholder="z. B. Software, Verband, Getränke"
            className={inputClass}
          />
        </Field>
      </div>
      <Field label="Notiz (optional)">
        <textarea name="note" rows={2} className={inputClass} />
      </Field>
      <Field label="Datei (Rechnung/Beleg)" hint="Bild oder PDF, max. 15 MB">
        <KasseUpload folder="belege" />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Speichert …" : "Beleg speichern"}
      </Button>
    </form>
  );
}
