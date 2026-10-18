// Reine Bestenlisten-Berechnung mit synthetischen Spielerzahlen.
// Keine Datenbank, kein Browser, kein Netzwerk und keine Servermodule.
// Aufruf: node --test scripts/test-bestenliste-wertung.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const filename = path.resolve(__dirname, "../src/lib/bestenliste.ts");
const moduleUnderTest = { exports: {} };
const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  fileName: filename,
});
new Function("require", "module", "exports", compiled.outputText)((name) => {
  throw new Error(`Der reine Bestenlisten-Helper darf keine Laufzeitabhängigkeit laden: ${name}`);
}, moduleUnderTest, moduleUnderTest.exports);
const {
  bestenlistenWerte, bestenlisteFuerAnsicht, vergleicheBestenliste, formatSiegquote,
} = moduleUnderTest.exports;

function spieler(anzeige, overrides = {}) {
  return {
    anzeige, spieltage: 0,
    einzelSiege: 0, einzelNiederlagen: 0, doppelSiege: 0, doppelNiederlagen: 0,
    legsGewonnen: 0, legsVerloren: 0,
    einzelLegsGewonnen: 0, einzelLegsVerloren: 0,
    doppelLegsGewonnen: 0, doppelLegsVerloren: 0,
    anzahl180: 0, besterFinish: null, besterLowDarts: null,
    ...overrides,
  };
}

const gemischt = spieler("Gemischter Spieler", {
  einzelSiege: 3, einzelNiederlagen: 1, doppelSiege: 1, doppelNiederlagen: 3,
  legsGewonnen: 22, legsVerloren: 20,
  einzelLegsGewonnen: 12, einzelLegsVerloren: 7,
  doppelLegsGewonnen: 10, doppelLegsVerloren: 13,
});

test("Gesamt zählt jeden Einzelsieg doppelt und jeden Doppelsieg einfach", () => {
  assert.deepEqual(bestenlistenWerte(gemischt), {
    siege: 4, niederlagen: 4, spiele: 8, punkte: 7, siegquote: 50,
    legsGewonnen: 22, legsVerloren: 20, legDifferenz: 2,
  });
  assert.deepEqual(bestenlistenWerte(gemischt, "gesamt"), bestenlistenWerte(gemischt));
});

test("Einzel verwendet ausschließlich Einzelspiele und Einzel-Legs", () => {
  assert.deepEqual(bestenlistenWerte(gemischt, "einzel"), {
    siege: 3, niederlagen: 1, spiele: 4, punkte: 6, siegquote: 75,
    legsGewonnen: 12, legsVerloren: 7, legDifferenz: 5,
  });
});

test("Doppel verwendet ausschließlich Doppelspiele und Doppel-Legs", () => {
  assert.deepEqual(bestenlistenWerte(gemischt, "doppel"), {
    siege: 1, niederlagen: 3, spiele: 4, punkte: 1, siegquote: 25,
    legsGewonnen: 10, legsVerloren: 13, legDifferenz: -3,
  });
});

test("Siegquote ist ungewichtet und bleibt intern ungerundet", () => {
  const s = spieler("Quote", { einzelSiege: 1, einzelNiederlagen: 3, doppelSiege: 3 });
  const werte = bestenlistenWerte(s);
  assert.equal(werte.punkte, 5);
  assert.equal(werte.siegquote, (4 / 7) * 100);
  assert.equal(formatSiegquote(werte.siegquote), "57,1 %");
});

test("Keine Partien ergibt keine Quote; ausschließlich Niederlagen ergeben null Prozent", () => {
  assert.equal(bestenlistenWerte(spieler("Ohne Spiele")).siegquote, null);
  const verloren = spieler("Verloren", { einzelNiederlagen: 2 });
  assert.equal(bestenlistenWerte(verloren, "einzel").siegquote, 0);
  assert.equal(bestenlistenWerte(verloren, "doppel").siegquote, null);
  assert.equal(formatSiegquote(null), "–");
  assert.equal(formatSiegquote(0), "0 %");
});

test("Die Darstellung verwendet höchstens eine deutsche Nachkommastelle", () => {
  assert.equal(formatSiegquote((2 / 3) * 100), "66,7 %");
  assert.equal(formatSiegquote(75), "75 %");
  assert.equal(formatSiegquote(100), "100 %");
  assert.equal(formatSiegquote(12.54), "12,5 %");
});

test("Die Punkterangfolge unterscheidet sich von bloßer Anzahl Siege", () => {
  const einzel = spieler("Einzel", { einzelSiege: 2, legsGewonnen: 1, legsVerloren: 100 });
  const doppel = spieler("Doppel", { doppelSiege: 3, legsGewonnen: 100 });
  assert.deepEqual([doppel, einzel].sort(vergleicheBestenliste).map((s) => s.anzeige), ["Einzel", "Doppel"]);
});

test("Bei Punktgleichstand entscheidet die Leg-Differenz statt der Siegquote", () => {
  const hoheQuote = spieler("Hohe Quote", { einzelSiege: 2, legsGewonnen: 6, legsVerloren: 5 });
  const bessereLegs = spieler("Bessere Legs", {
    einzelSiege: 2, einzelNiederlagen: 5, legsGewonnen: 15, legsVerloren: 10,
  });
  assert.ok(bestenlistenWerte(hoheQuote).siegquote > bestenlistenWerte(bessereLegs).siegquote);
  assert.deepEqual([hoheQuote, bessereLegs].sort(vergleicheBestenliste).map((s) => s.anzeige), ["Bessere Legs", "Hohe Quote"]);
});

test("Leg-Differenz entscheidet auch bei gegensätzlicher Reihenfolge des Leg-Quotienten", () => {
  const quotient = spieler("Hoher Quotient", { einzelSiege: 3, legsGewonnen: 20, legsVerloren: 5 });
  const differenz = spieler("Hohe Differenz", { einzelSiege: 3, legsGewonnen: 50, legsVerloren: 30 });
  assert.deepEqual([quotient, differenz].sort(vergleicheBestenliste).map((s) => s.anzeige), ["Hohe Differenz", "Hoher Quotient"]);
});

test("Bei gleicher Punktzahl und Leg-Differenz entscheidet der Name, niemals die Siegquote", () => {
  const anna = spieler("Anna", { einzelSiege: 2, einzelNiederlagen: 10, legsGewonnen: 10, legsVerloren: 8 });
  const zora = spieler("Zora", { einzelSiege: 2, legsGewonnen: 10, legsVerloren: 8 });
  assert.ok(bestenlistenWerte(anna).siegquote < bestenlistenWerte(zora).siegquote);
  assert.deepEqual([zora, anna].sort(vergleicheBestenliste).map((s) => s.anzeige), ["Anna", "Zora"]);
  assert.equal(vergleicheBestenliste(anna, anna), 0);
});

test("Einzel- und Doppelrangfolge verwenden die jeweilige Punktzahl und Leg-Differenz", () => {
  const a = spieler("A", {
    einzelSiege: 2, doppelSiege: 1,
    einzelLegsGewonnen: 10, einzelLegsVerloren: 5,
    doppelLegsGewonnen: 2, doppelLegsVerloren: 5,
    legsGewonnen: 12, legsVerloren: 10,
  });
  const b = spieler("B", {
    einzelSiege: 2, doppelSiege: 1,
    einzelLegsGewonnen: 7, einzelLegsVerloren: 5,
    doppelLegsGewonnen: 10, doppelLegsVerloren: 5,
    legsGewonnen: 17, legsVerloren: 10,
  });
  assert.deepEqual([b, a].sort((x, y) => vergleicheBestenliste(x, y, "einzel")).map((s) => s.anzeige), ["A", "B"]);
  assert.deepEqual([a, b].sort((x, y) => vergleicheBestenliste(x, y, "doppel")).map((s) => s.anzeige), ["B", "A"]);
});

test("Ansichtsfilter berücksichtigen auch reine Niederlagen und schließen fehlende Disziplinen aus", () => {
  const einzel = spieler("Nur Einzel", { einzelNiederlagen: 2 });
  const doppel = spieler("Nur Doppel", { doppelNiederlagen: 2 });
  const ohne = spieler("Noch ohne Partien");
  const liste = [einzel, doppel, gemischt, ohne];
  assert.deepEqual(bestenlisteFuerAnsicht(liste, "einzel"), [einzel, gemischt]);
  assert.deepEqual(bestenlisteFuerAnsicht(liste, "doppel"), [doppel, gemischt]);
  assert.deepEqual(bestenlisteFuerAnsicht(liste), liste);
  assert.notEqual(bestenlisteFuerAnsicht(liste), liste);
});

test("Berechnung, Ansichtsfilter und Sortierung einer Kopie verändern keine Eingabedaten", () => {
  const a = spieler("A", { einzelSiege: 1, einzelLegsGewonnen: 3 });
  const b = spieler("B", { doppelSiege: 3, doppelLegsGewonnen: 9 });
  const liste = [a, b];
  const vorher = structuredClone(liste);
  for (const s of liste) Object.freeze(s);
  Object.freeze(liste);
  bestenlistenWerte(a, "einzel");
  const sortiert = bestenlisteFuerAnsicht(liste).sort(vergleicheBestenliste);
  assert.deepEqual(sortiert.map((s) => s.anzeige), ["B", "A"]);
  assert.deepEqual(liste, vorher);
});
