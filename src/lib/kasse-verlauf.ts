// Monatlichen Kontostand-Verlauf aus den Buchungen berechnen. Da der
// StarMoney-Export die komplette Historie enthält, ergibt die aufsummierte
// Reihe (kumuliert) den Kontostand-Verlauf bis zum aktuellen Saldo.

export interface VerlaufMonat {
  monat: string; // "JJJJ-MM"
  einnahmen: number;
  ausgaben: number; // positiver Betrag
  saldo: number; // Kontostand am Monatsende (kumuliert)
}

export function monatsVerlauf(
  buchungen: { datum: string | null; betrag: number | string | null }[],
): VerlaufMonat[] {
  const proMonat = new Map<string, { ein: number; aus: number }>();
  for (const b of buchungen) {
    if (!b.datum) continue;
    const monat = b.datum.slice(0, 7);
    const betrag = Number(b.betrag ?? 0);
    if (!Number.isFinite(betrag)) continue;
    const e = proMonat.get(monat) ?? { ein: 0, aus: 0 };
    if (betrag >= 0) e.ein += betrag;
    else e.aus += -betrag;
    proMonat.set(monat, e);
  }

  const monate = [...proMonat.keys()].sort();
  let kumuliert = 0;
  return monate.map((monat) => {
    const { ein, aus } = proMonat.get(monat)!;
    kumuliert += ein - aus;
    return {
      monat,
      einnahmen: Math.round(ein * 100) / 100,
      ausgaben: Math.round(aus * 100) / 100,
      saldo: Math.round(kumuliert * 100) / 100,
    };
  });
}
