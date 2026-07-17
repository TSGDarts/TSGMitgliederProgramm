import { berechneErfolge, type ErfolgeBasis } from "@/lib/erfolge";

/**
 * Erfolge/Abzeichen: erreichte Abzeichen leuchten, noch offene sind
 * ausgegraut – so sieht man gleich, was als Nächstes drin ist.
 */
export function ErfolgeListe({ statistik }: { statistik: ErfolgeBasis }) {
  const erfolge = berechneErfolge(statistik);
  const anzahl = erfolge.filter((e) => e.erreicht).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {erfolge.map((e) => (
          <div
            key={e.id}
            className={`rounded-lg border p-2 text-center ${
              e.erreicht
                ? "border-primary/40 bg-primary/5"
                : "border-border opacity-40 grayscale"
            }`}
          >
            <p className="text-2xl">{e.emoji}</p>
            <p className="text-sm font-semibold">{e.titel}</p>
            <p className="text-xs text-muted">{e.beschreibung}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted">
        {anzahl} von {erfolge.length} Abzeichen erreicht – automatisch aus
        den eingespielten nuLiga-Spielberichten gezählt.
      </p>
    </div>
  );
}
