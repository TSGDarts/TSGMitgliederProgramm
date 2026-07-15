"use client";

import { useRouter } from "next/navigation";

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** Monat + Jahr im Kalender direkt anspringen (statt durchzublättern). */
export function MonthPicker({
  base,
  y,
  m,
  team,
}: {
  base: string;
  y: number;
  m: number;
  team?: string;
}) {
  const router = useRouter();

  const geheZu = (jahr: number, monat: number) => {
    const params = new URLSearchParams();
    params.set("monat", `${jahr}-${String(monat).padStart(2, "0")}`);
    if (team) params.set("team", team);
    router.push(`${base}${base.includes("?") ? "&" : "?"}${params.toString()}`);
  };

  const heuteJahr = new Date().getFullYear();
  const jahre = Array.from(
    new Set([y, heuteJahr - 1, heuteJahr, heuteJahr + 1, heuteJahr + 2, heuteJahr + 3]),
  ).sort((a, b) => a - b);

  const selectClass =
    "rounded-lg border border-border bg-surface px-2 py-1.5 text-sm font-semibold";

  return (
    <div className="flex items-center gap-2">
      <select
        value={m}
        onChange={(e) => geheZu(y, Number(e.target.value))}
        aria-label="Monat wählen"
        className={selectClass}
      >
        {MONATE.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>
      <select
        value={y}
        onChange={(e) => geheZu(Number(e.target.value), m)}
        aria-label="Jahr wählen"
        className={selectClass}
      >
        {jahre.map((j) => (
          <option key={j} value={j}>
            {j}
          </option>
        ))}
      </select>
    </div>
  );
}
