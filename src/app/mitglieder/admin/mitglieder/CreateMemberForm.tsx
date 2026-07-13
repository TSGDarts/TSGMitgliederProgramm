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
        <h2 className="font-semibold">Neuen Zugang anlegen</h2>

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
            <Field label="E-Mail">
              <input name="email" type="email" required className={inputClass} />
            </Field>
          </div>

          <Field label="Rolle">
            <select name="role" className={inputClass} defaultValue="player">
              <option value="player">Spieler</option>
              <option value="admin">Admin</option>
            </select>
          </Field>

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
