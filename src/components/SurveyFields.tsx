"use client";

import { inputClass } from "@/components/ui";
import {
  SURVEY_QUESTIONS,
  type SurveyQuestion,
  type SurveyAnswers,
} from "@/lib/season";

function RadioQuestion({
  q,
  nr,
  existing,
  required,
}: {
  q: SurveyQuestion;
  nr: number;
  existing: string;
  required: boolean;
}) {
  const isOther =
    q.allowOther &&
    existing !== "" &&
    !q.options.some((o) => o.value === existing);

  return (
    <fieldset className="space-y-2">
      <legend className="font-medium">
        {nr}. {q.label}{" "}
        {required && <span className="text-danger">*</span>}
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
              required={required}
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

/**
 * Die Fragen der Saisonabfrage – gemeinsam genutzt vom Mitglieder-Formular
 * und vom Admin-Formular („Antworten nachtragen“).
 */
export function SurveyFields({
  existing,
  requireAll = true,
}: {
  existing: SurveyAnswers | null;
  requireAll?: boolean;
}) {
  return (
    <>
      {/* 1. Letzte Saison */}
      <fieldset className="space-y-2">
        <legend className="font-medium">
          1. Warst du letztes Jahr bereits Liga gemeldet?{" "}
          {requireAll && <span className="text-danger">*</span>}
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
                required={requireAll}
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
        required={requireAll}
      />

      {/* 3. Kapitän */}
      <RadioQuestion
        q={SURVEY_QUESTIONS[1]}
        nr={3}
        existing={existing?.captain_interest ?? ""}
        required={requireAll}
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
        required={requireAll}
      />

      {/* 6. Aussetzen */}
      <RadioQuestion
        q={SURVEY_QUESTIONS[3]}
        nr={6}
        existing={existing?.sit_out ?? ""}
        required={requireAll}
      />

      {/* 7 + 8. Pokale */}
      <RadioQuestion
        q={SURVEY_QUESTIONS[4]}
        nr={7}
        existing={existing?.pokal_ku ?? ""}
        required={requireAll}
      />
      <RadioQuestion
        q={SURVEY_QUESTIONS[5]}
        nr={8}
        existing={existing?.pokal_8er ?? ""}
        required={requireAll}
      />
    </>
  );
}
