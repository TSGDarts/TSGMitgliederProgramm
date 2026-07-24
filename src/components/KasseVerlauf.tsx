import type { VerlaufMonat } from "@/lib/kasse-verlauf";

const euro = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const monatLabel = (m: string) => {
  const [j, mm] = m.split("-");
  return `${mm}/${j.slice(2)}`;
};

/**
 * Einfache Kontostand-Verlaufskurve (Inline-SVG, ohne Fremd-Bibliothek).
 * Zeigt die letzten bis zu 36 Monate.
 */
export function KasseVerlauf({ verlauf }: { verlauf: VerlaufMonat[] }) {
  const daten = verlauf.slice(-36);
  if (daten.length < 2) {
    return (
      <p className="text-sm text-muted">
        Sobald Buchungen aus mehreren Monaten vorliegen, erscheint hier die
        Verlaufskurve.
      </p>
    );
  }

  const W = 720;
  const H = 220;
  const padL = 8;
  const padR = 8;
  const padT = 16;
  const padB = 24;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const werte = daten.map((d) => d.saldo);
  const min = Math.min(0, ...werte);
  const max = Math.max(0, ...werte);
  const spanne = max - min || 1;

  const x = (i: number) => padL + (i / (daten.length - 1)) * innerW;
  const y = (v: number) => padT + innerH - ((v - min) / spanne) * innerH;

  const linie = daten.map((d, i) => `${x(i)},${y(d.saldo)}`).join(" ");
  const flaeche = `${padL},${y(min)} ${linie} ${padL + innerW},${y(min)}`;
  const yNull = y(0);

  // sparsame X-Beschriftung (max ~6 Labels)
  const schritt = Math.ceil(daten.length / 6);
  const letzter = daten[daten.length - 1];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm text-muted">
          Kontostand-Verlauf ({monatLabel(daten[0].monat)} –{" "}
          {monatLabel(letzter.monat)})
        </span>
        <span className="text-sm font-semibold">
          aktuell {euro(letzter.saldo)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full min-w-[36rem] text-primary"
          role="img"
          aria-label="Kontostand-Verlauf"
        >
          {/* Nulllinie */}
          <line
            x1={padL}
            x2={padL + innerW}
            y1={yNull}
            y2={yNull}
            stroke="currentColor"
            strokeWidth={1}
            className="text-border"
            strokeDasharray="4 4"
          />
          {/* Fläche */}
          <polyline
            points={flaeche}
            fill="currentColor"
            className="text-primary/10"
            stroke="none"
          />
          {/* Linie */}
          <polyline
            points={linie}
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* letzter Punkt */}
          <circle cx={x(daten.length - 1)} cy={y(letzter.saldo)} r={4} fill="currentColor" />
          {/* X-Labels */}
          {daten.map((d, i) =>
            i % schritt === 0 || i === daten.length - 1 ? (
              <text
                key={d.monat}
                x={x(i)}
                y={H - 6}
                textAnchor="middle"
                className="fill-muted text-[11px]"
              >
                {monatLabel(d.monat)}
              </text>
            ) : null,
          )}
        </svg>
      </div>
    </div>
  );
}
