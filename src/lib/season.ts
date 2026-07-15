// Saisonplanung: Typen + Fragenkatalog der Saisonabfrage.
// Die Fragen entsprechen der bisherigen Forms-Umfrage des Vereins
// (Name entfällt – die Mitglieder sind eingeloggt).

export interface Season {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  status: "active" | "archived";
  survey_open: boolean;
  pokal_ku_teams?: number | null;
  pokal_8er_teams?: number | null;
  created_at: string;
}

export interface SurveyResponse {
  season_id: string;
  profile_id: string;
  played_last_season: boolean | null;
  play_frequency: string;
  captain_interest: string;
  team_wishes: string;
  ambitions: string;
  sit_out: string;
  pokal_ku: string;
  pokal_8er: string;
  updated_at: string;
}

/** Nur die Antwort-Felder (für Mitglieder UND vorab angelegte Namen). */
export type SurveyAnswers = Pick<
  SurveyResponse,
  | "played_last_season"
  | "play_frequency"
  | "captain_interest"
  | "team_wishes"
  | "ambitions"
  | "sit_out"
  | "pokal_ku"
  | "pokal_8er"
>;

export interface ArchivedTeam {
  id: string;
  season_id: string;
  team_name: string;
  league: string;
  roster: { name: string; captain: boolean; vice: boolean }[];
  stats: {
    termine?: number;
    zusagen?: number;
    absagen?: number;
    vielleicht?: number;
    spieler?: { name: string; zusagen: number; absagen: number; vielleicht: number }[];
  };
  archived_at: string;
}

export type Option = { value: string; label: string };

export type SurveyQuestion = {
  field: keyof Pick<
    SurveyResponse,
    | "play_frequency"
    | "captain_interest"
    | "ambitions"
    | "sit_out"
    | "pokal_ku"
    | "pokal_8er"
  >;
  label: string;
  hint?: string;
  options: Option[];
  allowOther: boolean;
};

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    field: "play_frequency",
    label: "Wie viel willst du in der Saison spielen?",
    options: [
      { value: "always", label: "Ich bin jedes Ligaspiel da!" },
      { value: "when_can", label: "Wenn ich kann, dann will ich spielen" },
      { value: "as_needed", label: "Ich spiele wie ich gebraucht werde und Zeit habe" },
      { value: "backup", label: "Ich will nur Notfall/Backup sein" },
    ],
    allowOther: true,
  },
  {
    field: "captain_interest",
    label: "Würdest du Kapitän in einer Mannschaft machen?",
    options: [
      { value: "yes", label: "Ja, ich will Kapitän sein!" },
      { value: "maybe", label: "Ja, ich würde Kapitän machen, muss aber nicht" },
      { value: "no", label: "Nein, Kapitän ist keine Option für mich!" },
    ],
    allowOther: false,
  },
  {
    field: "ambitions",
    label: "Welche Ambitionen hast du für die Saison?",
    options: [
      {
        value: "performance",
        label: "Ich will auf Leistung spielen! In einer höchstmöglichen Mannschaft.",
      },
      { value: "play_much", label: "Ich will möglichst viel spielen!" },
      { value: "fun", label: "Ich spiele zum Spaß!" },
      {
        value: "social",
        label: "Ich muss nicht zwingend spielen, dabei sein und Spaß haben ist alles!",
      },
    ],
    allowOther: false,
  },
  {
    field: "sit_out",
    label: "Würdest du aussetzen für den Erfolg des Teams?",
    hint: "Hier bitte ganz ehrlich antworten! Hilft uns einzuschätzen und ist eine wichtige Frage für die Aufteilung der Mannschaften!",
    options: [
      { value: "yes_all", label: "Ja! Alles für das ausgegebene Ziel der Mannschaft" },
      {
        value: "yes_if_better",
        label: "Ja! Aber nur wenn ein wirklich besserer Spieler für mich spielt!",
      },
      { value: "yes_reluctant", label: "Ja! Aber ungerne" },
      { value: "no", label: "Nein, das ist keine Option für mich!" },
    ],
    allowOther: true,
  },
  {
    field: "pokal_ku",
    label:
      "Willst du im Klaus Unterberg Pokal (MittelfrankenPokal mit 4 Leuten) mitspielen?",
    options: [
      { value: "yes", label: "Ja" },
      { value: "if_needed", label: "Ja, wenn ihr jemanden braucht" },
      { value: "no", label: "Nein" },
    ],
    allowOther: true,
  },
  {
    field: "pokal_8er",
    label:
      "Willst du im 8ter Cup (Pokal des Bayrischen Dart Verbands BDV mit 8 Leuten) mitspielen?",
    options: [
      { value: "yes", label: "Ja" },
      { value: "if_needed", label: "Ja, wenn ihr jemanden braucht" },
      { value: "no", label: "Nein" },
    ],
    allowOther: true,
  },
];

/**
 * Liest die Antworten aus einem abgesendeten Fragebogen-Formular.
 * Bei "Sonstiges" wird der Freitext übernommen.
 */
export function parseSurveyAnswers(formData: FormData) {
  const pick = (name: string): string => {
    const v = String(formData.get(name) ?? "");
    if (v === "__other") {
      return String(formData.get(`${name}_other`) ?? "").trim();
    }
    return v;
  };

  const playedRaw = String(formData.get("played_last_season") ?? "");
  const answers: Record<string, unknown> = {
    played_last_season:
      playedRaw === "ja" ? true : playedRaw === "nein" ? false : null,
    team_wishes: String(formData.get("team_wishes") ?? "").trim(),
  };
  for (const q of SURVEY_QUESTIONS) {
    answers[q.field] = pick(q.field);
  }
  return answers;
}

/** Übersetzt einen gespeicherten Wert in den Anzeigetext. */
export function surveyLabel(field: SurveyQuestion["field"], value: string): string {
  if (!value) return "—";
  const q = SURVEY_QUESTIONS.find((x) => x.field === field);
  const opt = q?.options.find((o) => o.value === value);
  return opt ? opt.label : `„${value}“`; // Freitext (Sonstiges)
}

/** Kurzlabels für die kompakte Planungsansicht. */
export const SHORT_LABELS: Record<string, string> = {
  always: "Jedes Spiel",
  when_can: "Wenn möglich",
  as_needed: "Nach Bedarf",
  backup: "Nur Backup",
  yes: "Ja",
  maybe: "Wenn nötig",
  no: "Nein",
  if_needed: "Wenn nötig",
  performance: "Leistung",
  play_much: "Viel spielen",
  fun: "Spaß",
  social: "Dabei sein",
  yes_all: "Setzt aus",
  yes_if_better: "Aussetzen: nur für Bessere",
  yes_reluctant: "Aussetzen: ungern",
};

export function shortLabel(value: string): string {
  if (!value) return "—";
  return SHORT_LABELS[value] ?? `„${value}“`;
}
