import {
  JERSEY_SIZES,
  jerseySizeLabel,
  type JerseySize,
} from "@/lib/jersey";

const MASSE: Record<
  JerseySize,
  { brust: string; laenge: string; aermel: string }
> = {
  "2XS": { brust: "46", laenge: "67", aermel: "20" },
  XS: { brust: "49", laenge: "69", aermel: "21" },
  S: { brust: "52", laenge: "71", aermel: "22" },
  M: { brust: "55", laenge: "73", aermel: "23" },
  L: { brust: "58", laenge: "75", aermel: "24" },
  XL: { brust: "61", laenge: "77", aermel: "24" },
  "2XL": { brust: "64", laenge: "79", aermel: "25" },
  "3XL": { brust: "66", laenge: "81", aermel: "25,5" },
  "4XL": { brust: "68", laenge: "83", aermel: "26" },
  "5XL": { brust: "72", laenge: "85", aermel: "26" },
  "6XL": { brust: "75", laenge: "87", aermel: "26,5" },
  "7XL": { brust: "78", laenge: "89", aermel: "26,5" },
  "8XL": { brust: "75", laenge: "97", aermel: "27,5" },
  "9XL": { brust: "77", laenge: "97", aermel: "27,5" },
};

/** Mobil lesbare Abschrift der mitgelieferten Hersteller-Maßtabelle. */
export function TrikotgroessenTabelle() {
  return (
    <details className="rounded-lg border border-border">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-primary">
        📏 Maßtabelle anzeigen
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <p className="text-sm text-muted">
          Miss ein gut sitzendes Poloshirt flach liegend: <strong>A</strong> =
          Brustweite von Achsel zu Achsel, <strong>B</strong> = Länge von der
          Schulter bis zum Saum, <strong>C</strong> = Ärmellänge. Alle Angaben
          in cm.
        </p>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-96 text-left text-sm">
            <caption className="sr-only">
              Hersteller-Maße des Poloshirts nach Trikotgröße in Zentimetern
            </caption>
            <thead className="bg-border/40">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Größe
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  A Brust
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  B Länge
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  C Ärmel
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {JERSEY_SIZES.map((size) => (
                <tr key={size}>
                  <th scope="row" className="px-3 py-2 font-medium">
                    {jerseySizeLabel(size)}
                  </th>
                  <td className="px-3 py-2">{MASSE[size].brust}</td>
                  <td className="px-3 py-2">{MASSE[size].laenge}</td>
                  <td className="px-3 py-2">{MASSE[size].aermel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted">
          Die Vorlage ist als „Polo Men“ bezeichnet. Maße können laut
          Hersteller um ± 1 cm abweichen. Die ungewöhnlichen Brustweiten bei
          8XL und 9XL sind unverändert aus der Vorlage übernommen – im Zweifel
          bitte ein Mustertrikot probieren.
        </p>
      </div>
    </details>
  );
}
