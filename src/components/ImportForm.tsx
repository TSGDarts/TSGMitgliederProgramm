"use client";

import { useActionState } from "react";
import { importKontostand, type Res } from "@/app/mitglieder/kasse/actions";
import { Button, Field } from "@/components/ui";

/** Upload + automatisches Auslesen der StarMoney-Auswertung. */
export function ImportForm() {
  const [state, formAction, pending] = useActionState<Res | null, FormData>(
    importKontostand,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      {state && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      )}
      <Field
        label="Excel vom Hauptverein (StarMoney-Auswertung)"
        hint="Die App liest Saldo, Einnahmen/Ausgaben und alle Buchungen automatisch aus."
      >
        <input
          type="file"
          name="datei"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-fg hover:file:opacity-90"
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Wird eingelesen …" : "Datei einlesen"}
      </Button>
    </form>
  );
}
