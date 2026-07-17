// Erfolge/Abzeichen: automatische Meilensteine aus der Liga-Statistik.
// Wird komplett aus den vorhandenen Zahlen berechnet – nichts wird extra
// gespeichert (nur der Push bei neuen Abzeichen läuft über notification_log).

export interface ErfolgeBasis {
  spieltage: number;
  einzelSiege: number;
  einzelNiederlagen: number;
  doppelSiege: number;
  doppelNiederlagen: number;
  legsGewonnen: number;
  legsVerloren: number;
  anzahl180: number;
  besterFinish: number | null;
  besterLowDarts: number | null;
}

export interface Erfolg {
  id: string;
  emoji: string;
  titel: string;
  beschreibung: string;
  erreicht: boolean;
}

/** Alle Abzeichen mit Erreicht-Status – Reihenfolge = Anzeige-Reihenfolge. */
export function berechneErfolge(s: ErfolgeBasis): Erfolg[] {
  const siege = s.einzelSiege + s.doppelSiege;
  const def = (
    id: string,
    emoji: string,
    titel: string,
    beschreibung: string,
    erreicht: boolean,
  ): Erfolg => ({ id, emoji, titel, beschreibung, erreicht });

  return [
    def("spieltag-1", "🎯", "Dabei!", "Erster Spieltag im Bericht", s.spieltage >= 1),
    def("spieltage-10", "📅", "Stammspieler", "10 Spieltage", s.spieltage >= 10),
    def("spieltage-25", "🗓", "Dauerbrenner", "25 Spieltage", s.spieltage >= 25),
    def("spieltage-50", "🏟", "Urgestein", "50 Spieltage", s.spieltage >= 50),
    def("sieg-1", "✅", "Erster Sieg", "1 Spiel gewonnen", siege >= 1),
    def("siege-10", "🔟", "Zweistellig", "10 Siege", siege >= 10),
    def("siege-25", "🥉", "Siegertyp", "25 Siege", siege >= 25),
    def("siege-50", "🥈", "Halbes Hundert", "50 Siege", siege >= 50),
    def("siege-100", "🥇", "Jahrhundert", "100 Siege", siege >= 100),
    def("legs-100", "🦵", "Leg-Sammler", "100 gewonnene Legs", s.legsGewonnen >= 100),
    def("legs-250", "💪", "Leg-Maschine", "250 gewonnene Legs", s.legsGewonnen >= 250),
    def("180-1", "💯", "Maximum!", "Erste 180", s.anzahl180 >= 1),
    def("180-10", "🎇", "180er-Serie", "10× 180", s.anzahl180 >= 10),
    def("180-25", "🎆", "180er-König", "25× 180", s.anzahl180 >= 25),
    def(
      "finish-100",
      "🎯",
      "Dreistellig ausgemacht",
      "Highfinish 100+",
      (s.besterFinish ?? 0) >= 100,
    ),
    def(
      "finish-130",
      "✨",
      "Finish-Künstler",
      "Highfinish 130+",
      (s.besterFinish ?? 0) >= 130,
    ),
    def(
      "finish-170",
      "🐟",
      "Big Fish",
      "Highfinish 170",
      (s.besterFinish ?? 0) >= 170,
    ),
    def(
      "lowdarts-21",
      "⚡",
      "Schnelles Leg",
      "Leg in max. 21 Darts",
      s.besterLowDarts !== null && s.besterLowDarts <= 21,
    ),
    def(
      "lowdarts-18",
      "🚀",
      "Turbo-Leg",
      "Leg in max. 18 Darts",
      s.besterLowDarts !== null && s.besterLowDarts <= 18,
    ),
    def(
      "lowdarts-15",
      "🔥",
      "Weltklasse-Leg",
      "Leg in max. 15 Darts",
      s.besterLowDarts !== null && s.besterLowDarts <= 15,
    ),
  ];
}
