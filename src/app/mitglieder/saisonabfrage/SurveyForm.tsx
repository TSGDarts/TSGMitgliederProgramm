"use client";

import { useActionState } from "react";
import { submitSurvey, type SurveyResult } from "./actions";
import { Button, inputClass } from "@/components/ui";
import {
  SURVEY_QUESTIONS,
  type SurveyQuestion,
  type SurveyResponse,
} from "@/lib/season";

function RadioQuestion({
  q,
  nr,
  existing,
}: {
  q: SurveyQuestion;
  nr: number;
  existing: string;
}) {
  const isOther =
    q.allowOther &&
    existing !== "" &&
    !q.options.some((o) => o.value === existing);

  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">
        {nr}. {q.label} <span className="text-danger">*</span>
      </legend>
      {q.hint && <p className="text-sm text-muted">{q.hint}</p>}
      <div className="space-y-1">
        {q.options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm hover:bg-border/40"
          >
            <input
              type="radio"
              name={q.field}
              value={o.value}
              required
              defaultChecked={existing === o.value}
              className="mt-0.5 accent-[var(--primary)]"
            />
            <span>{o.label}</span>
          </label>
        ))}
        {q.allowOther && (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-border/40">
            <input
              type="radio"
              name={q.field}
              value="__other"
              defaultChecked={isOther}
              className="accent-[var(--primary)]"
            />
            <input
              type="text"
              name={`${q.field}_other`}
              placeholder="Sonstiges …"
              defaultValue={isOther ? existing : ""}
              className={`${inputClass} py-1`}
              onFocus={(e) => {
                const radio = e.currentTarget
                  .closest("label")
                  ?.querySelector<HTMLInputElement>('input[type="radio"]');
                if (radio) radio.checked = true;
              }}
            />
          </label>
        )}
      </div>
    </fieldset>
  );
}

export function SurveyForm({
  seasonId,
  existing,
}: {
  seasonId: string;
  existing: SurveyResponse | null;
}) {
  const [state, formAction, pending] = useActionState<
    SurveyResult | null,
    FormData
  >(submitSurvey, null);

  return (
    <form action={formAction} className="space-y-8">
      <input type="hidden" name="season_id" value={seasonId} />

      {state && (
        <p
          className={`rounded-lg px-3 py-2 text-sm ${
            state.ok ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger"
          }`}
        >
          {state.message}
        </p>
      )}

      {/* 1. Letzte Saison */}
      <fieldset className="space-y-2">
        <legend className="font-medium">
          1. Warst du letztes Jahr bereits Liga gemeldet?{" "}
          <span className="text-danger">*</span>
        </legend>
        <div className="space-y-1">
          {(["ja", "nein"] as const).map((v) => (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-border/40"
            >
              <input
                type="radio"
                name="played_last_season"
                value={v}
                required
                defaultChecked={
                  existing?.played_last_season === (v === "ja")
                    ? true
                    : undefined
                }
                className="accent-[var(--primary)]"
              />
              <span>{v === "ja" ? "Ja" : "Nein"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 2. Einsatz */}
      <RadioQuestion
        q={SURVEY_QUESTIONS[0]}
        nr={2}
        existing={existing?.play_frequency ?? ""}
      />

      {/* 3. Kapitän */}
      <RadioQuestion
        q={SURVEY_QUESTIONS[1]}
        nr={3}
        existing={existing?.captain_interest ?? ""}
      />

      {/* 4. Wünsche (Freitext) */}
      <fieldset className="space-y-2">
        <legend className="font-medium">
          4. Wünsche für die Mannschaftsbildung?
        </legend>
        <p className="text-sm text-muted">
          z. B. mit einer/mehreren bestimmten Person/nen
        </p>
        <textarea
          name="team_wishes"
          rows={3}
          defaultValue={existing?.team_wishes ?? ""}
          className={inputClass}
        />
      </fieldset>

      {/* 5. Ambitionen */}
      <RadioQuestion
        q={SURVEY_QUESTIONS[2]}
        nr={5}
        existing={existing?.ambitions ?? ""}
      />

      {/* 6. Aussetzen */}
      <RadioQuestion
        q={SURVEY_QUESTIONS[3]}
        nr={6}
        existing={existing?.sit_out ?? ""}
      />

      {/* 7 + 8. Pokale */}
      <RadioQuestion
        q={SURVEY_QUESTIONS[4]}
        nr={7}
        existing={existing?.pokal_ku ?? ""}
      />
      <RadioQuestion
        q={SURVEY_QUESTIONS[5]}
        nr={8}
        existing={existing?.pokal_8er ?? ""}
      />

      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending
          ? "Speichere …"
          : existing
            ? "Antworten aktualisieren"
            : "Antworten absenden"}
      </Button>
    </form>
  );
}
