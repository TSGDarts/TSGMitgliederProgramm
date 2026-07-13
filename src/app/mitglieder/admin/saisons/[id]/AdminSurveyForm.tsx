"use client";

import { useActionState } from "react";
import { adminSaveSurvey, type AdminSurveyResult } from "../actions";
import { Button } from "@/components/ui";
import { SurveyFields } from "@/components/SurveyFields";
import type { SurveyAnswers } from "@/lib/season";

export function AdminSurveyForm({
  seasonId,
  profileId,
  inviteId,
  existing,
}: {
  seasonId: string;
  profileId?: string;
  inviteId?: string;
  existing: SurveyAnswers | null;
}) {
  const [state, formAction, pending] = useActionState<
    AdminSurveyResult | null,
    FormData
  >(adminSaveSurvey, null);

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="season_id" value={seasonId} />
      {profileId && <input type="hidden" name="profile_id" value={profileId} />}
      {inviteId && <input type="hidden" name="invite_id" value={inviteId} />}

      {state && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      )}

      {/* requireAll=false: beim Nachtragen dürfen Fragen offen bleiben */}
      <SurveyFields existing={existing} requireAll={false} />

      <Button type="submit" disabled={pending}>
        {pending ? "Speichere …" : "Antworten speichern"}
      </Button>
    </form>
  );
}
