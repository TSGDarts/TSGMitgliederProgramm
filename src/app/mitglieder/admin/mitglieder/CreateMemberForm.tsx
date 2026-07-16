"use client";

import { useActionState } from "react";
import { createMember, type CreateMemberResult } from "./actions";
import { Card, CardBody, Button, Field, inputClass } from "@/components/ui";
import { InviteLink } from "./InviteLink";
import type { Team } from "@/lib/types";

export function CreateMemberForm({ teams }: { teams: Team[] }) {
  const [state, formAction, pending] = useActionState<
    CreateMemberResult | null,
    FormData
  >(createMember, null);

  return (
    <Card>
      <CardBody className="space-y-4">
        <h2 className="font-semibold">Neues Mitglied anlegen</h2>
        <p className="text-sm text-muted">
          Nur der <strong>Name</strong> ist nötig. Ohne E-Mail wartet die Person
          auf die Selbst-Anmeldung über den Beitritts-Link/QR und gibt E-Mail +
          Passwort dabei selbst an. Mit E-Mail wird sofort ein Zugang mit
          Passwort-Link erstellt.
        </p>

        {state && (
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              state.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
            }`}
          >
            {state.message}
          </div>
        )}
        {state?.inviteUrl && <InviteLink url={state.inviteUrl} />}

        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input name="full_name" required className={inputClass} />
            </Field>
            <Field label="E-Mail (optional)">
              <input name="email" type="email" className={inputClass} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rolle">
              <select name="role" className={inputClass} defaultValue="player">
                <option value="player">Spieler (Liga)</option>
                <option value="member">Mitglied (ohne Liga)</option>
                <option value="editor">Bearbeiter</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field
              label="Geburtstag (optional)"
              hint="Für die Liga-Meldung – falls schon bekannt"
            >
              <input name="birthday" type="date" className={inputClass} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="birthday_public" />
            Geburtstag im Mitglieder-Kalender anzeigen 🎂
            <span className="text-xs text-muted">
              (entscheidet die Person später selbst)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="birthday_congrats" />
            In der Mitgliedergruppe gratulieren 🎉
            <span className="text-xs text-muted">
              (entscheidet die Person später selbst)
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_trainer" />
            💪 Trainer – darf Trainings eintragen
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_planner" />
            🧠 Saisonplaner – darf eigene Planungs-Entwürfe pflegen
          </label>

          {teams.length > 0 && (
            <Field label="Mannschaften (optional)">
              <div className="flex flex-wrap gap-3">
                {teams.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="team_ids" value={t.id} />
                    {t.name}
                  </label>
                ))}
              </div>
            </Field>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Lege an …" : "Zugang anlegen"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
