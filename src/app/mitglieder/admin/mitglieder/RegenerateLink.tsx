"use client";

import { useActionState } from "react";
import { regenerateLink, type CreateMemberResult } from "./actions";
import { InviteLink } from "./InviteLink";

export function RegenerateLink({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<
    CreateMemberResult | null,
    FormData
  >(regenerateLink, null);

  return (
    <div className="space-y-2">
      <form action={formAction}>
        <input type="hidden" name="email" value={email} />
        <button
          disabled={pending}
          className="text-sm text-primary hover:underline disabled:opacity-50"
        >
          {pending ? "…" : "Passwort-Link erzeugen"}
        </button>
      </form>
      {state?.inviteUrl && <InviteLink url={state.inviteUrl} />}
      {state && !state.ok && (
        <p className="text-xs text-danger">{state.message}</p>
      )}
    </div>
  );
}
