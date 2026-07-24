import type { NuligaTabelle } from "@/lib/nuliga-tabelle";

/**
 * Live aus nuLiga geladene Liga-Tabelle. Zeilen der eigenen Mannschaften
 * (Name enthält `eigenerName`) werden hervorgehoben.
 */
export function LigaTabelle({
  tabelle,
  eigenerName = "TSG 08 Roth",
}: {
  tabelle: NuligaTabelle;
  eigenerName?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-2 py-2">#</th>
            <th className="px-2 py-2">Mannschaft</th>
            <th className="px-2 py-2 text-center">S-U-N</th>
            <th className="px-2 py-2 text-center">Spiele</th>
            <th className="px-2 py-2 text-center">Legs</th>
            <th className="px-2 py-2 text-right">Punkte</th>
          </tr>
        </thead>
        <tbody>
          {tabelle.zeilen.map((z) => {
            const eigen = eigenerName
              ? z.team.toLowerCase().includes(eigenerName.toLowerCase())
              : false;
            return (
              <tr
                key={`${z.rang}-${z.team}`}
                className={`border-b border-border/50 ${
                  eigen ? "bg-primary/10 font-medium" : ""
                }`}
              >
                <td className="px-2 py-1.5 text-muted">
                  {z.rang}
                  {z.status === "Aufsteiger" && (
                    <span title="Aufstiegsplatz" className="ml-1 text-ok">
                      ▲
                    </span>
                  )}
                  {z.status === "Absteiger" && (
                    <span title="Abstiegsplatz" className="ml-1 text-danger">
                      ▼
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5">{z.team}</td>
                <td className="px-2 py-1.5 text-center whitespace-nowrap">
                  {z.s}-{z.u}-{z.n}
                </td>
                <td className="px-2 py-1.5 text-center text-muted whitespace-nowrap">
                  {z.spiele}
                </td>
                <td className="px-2 py-1.5 text-center text-muted whitespace-nowrap">
                  {z.legs}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold whitespace-nowrap">
                  {z.punkte}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted">
        ▲ Aufstiegsplatz · ▼ Abstiegsplatz · Live aus nuLiga (alle ~30 Min
        aktualisiert).
      </p>
    </div>
  );
}
