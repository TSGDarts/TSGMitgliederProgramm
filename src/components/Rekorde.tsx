import Link from "next/link";
import type { Rekorde as RekordeDaten } from "@/lib/statistik";

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Europe/Berlin",
});

/** Vereins-Rekorde: höchste Finishes, kürzeste Legs, 180er-Rangliste. */
export function Rekorde({ rekorde }: { rekorde: RekordeDaten }) {
  const { finishes, lowdarts, m180 } = rekorde;

  return (
    <div className="space-y-6">
      {/* Höchste High Finishes */}
      <section className="space-y-2">
        <h3 className="font-semibold">🎯 Höchste High Finishes</h3>
        {finishes.length === 0 ? (
          <p className="text-sm text-muted">Noch keine erfasst.</p>
        ) : (
          <div className="space-y-1">
            {finishes.map((e, i) => (
              <Link
                key={`${e.eventId}-${i}`}
                href={`/mitglieder/termine/${e.eventId}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-border/30"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 text-right text-muted">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <span className="truncate">{e.anzeige}</span>
                </span>
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <span className="font-bold text-ok">{e.wert}</span>
                  <span className="text-xs text-muted">
                    {dateFmt.format(new Date(e.datum))}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* 180er-Rangliste */}
      <section className="space-y-2">
        <h3 className="font-semibold">💯 Meiste 180er</h3>
        {m180.length === 0 ? (
          <p className="text-sm text-muted">Noch keine erfasst.</p>
        ) : (
          <div className="space-y-1">
            {m180.map((e, i) => (
              <div
                key={e.anzeige}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 text-right text-muted">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <span className="truncate">{e.anzeige}</span>
                </span>
                <span className="font-bold">{e.anzahl}×</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Kürzeste Legs */}
      <section className="space-y-2">
        <h3 className="font-semibold">⚡ Kürzeste Legs (wenigste Darts)</h3>
        {lowdarts.length === 0 ? (
          <p className="text-sm text-muted">Noch keine erfasst.</p>
        ) : (
          <div className="space-y-1">
            {lowdarts.map((e, i) => (
              <Link
                key={`${e.eventId}-${i}`}
                href={`/mitglieder/termine/${e.eventId}`}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-border/30"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="w-6 text-right text-muted">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <span className="truncate">{e.anzeige}</span>
                </span>
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <span className="font-bold">{e.wert} Darts</span>
                  <span className="text-xs text-muted">
                    {dateFmt.format(new Date(e.datum))}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <p className="text-xs text-muted">
        Automatisch aus den eingespielten nuLiga-Spielberichten. Eintrag
        antippen öffnet den Spieltag.
      </p>
    </div>
  );
}
