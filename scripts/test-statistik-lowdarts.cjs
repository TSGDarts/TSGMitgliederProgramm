// Echte Vereins-Aggregation mit eindeutig markierten und alten Low-Darts-Werten.
// Keine Datenbank und kein Netzwerk.
// Aufruf: node --test scripts/test-statistik-lowdarts.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
function load(file, modules = {}) {
  const filename = path.join(root, file);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(code, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unerwartete Abhängigkeit ${name}`);
      return modules[name];
    },
  }, { filename });
  return exports;
}
const spielbericht = load("src/lib/spielbericht.ts");
const format = load("src/lib/format.ts");
const { vereinsAggregat } = load("src/lib/statistik.ts", {
  "@/lib/spielbericht": spielbericht,
  "@/lib/format": format,
  "@/lib/supabase/server": { createClient: () => { throw Error("Dieser Aggregat-Test darf keine DB öffnen."); } },
});

const ferdinand = "Schneck, Ferdinand";
const marco = "Jauch, Marco";
function game(unsere = [ferdinand], doppel = false) {
  return {
    nr: doppel ? "D1-D1" : "1-1", doppel, unsere,
    gegner: doppel ? ["Gegner, Eins", "Gegner, Zwei"] : ["Gegner, Eins"],
    legs: "3:1", gewonnen: true,
  };
}
function low(name, wert, doppel) {
  return {
    kategorie: "lowdarts", anzahl: 1, name, wert, mannschaft: "TSG 08 Roth VI",
    ...(doppel === undefined ? {} : { doppel }),
  };
}
function event(id, spiele, bestleistungen = [], oldShape = false) {
  const bericht = {
    heim: "TSG 08 Roth VI", gast: "Gegner", wirSindHeim: true,
    ergebnis: "10:2", legsGesamt: "30:8", spiele, bestleistungen, uebersprungen: 0,
  };
  return {
    id, title: `Spieltag ${id}`, starts_at: "2026-10-16T18:00:00Z", result: "10:2",
    match_stats: oldShape ? bericht : { nuliga: bericht },
  };
}
function lowValues(row) {
  return {
    gesamt: row.besterLowDarts,
    einzel: row.besterLowDartsEinzel,
    doppel: row.besterLowDartsDoppel,
  };
}
function freezeDeep(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test("Neue Spieler starten ohne Low-Darts-Bestleistung in beiden Disziplinen", () => {
  const [row] = vereinsAggregat([event("ohne", [game()])]);
  assert.deepEqual(lowValues(row), { gesamt: null, einzel: null, doppel: null });
});

test("Ein expliziter Einzelwert befüllt nur Einzel und den bisherigen Gesamtwert", () => {
  const [row] = vereinsAggregat([event("einzel", [game()], [low(ferdinand, 18, false)])]);
  assert.deepEqual(lowValues(row), { gesamt: 18, einzel: 18, doppel: null });
});

test("Eindeutig markierte Doppelwerte werden beiden ausdrücklich genannten Partnern zugeordnet", () => {
  const rows = vereinsAggregat([event("doppel", [game([ferdinand, marco], true)], [
    low(ferdinand, 14, true), low("Marco Jauch", 14, true),
  ])]);
  assert.equal(rows.length, 2);
  for (const row of rows) assert.deepEqual(lowValues(row), { gesamt: 14, einzel: null, doppel: 14 });
});

test("Gemeinsame Doppelteilnahme kopiert eine Bestleistung nicht auf einen ungenannten Partner", () => {
  const rows = vereinsAggregat([event("partner", [game([ferdinand, marco], true)], [low(ferdinand, 15, true)])]);
  assert.deepEqual(lowValues(rows.find((row) => row.anzeige === "Ferdinand Schneck")), { gesamt: 15, einzel: null, doppel: 15 });
  assert.deepEqual(lowValues(rows.find((row) => row.anzeige === "Marco Jauch")), { gesamt: null, einzel: null, doppel: null });
});

test("Mehrere Werte und normalisierte Namen bilden je Disziplin das unabhängige Minimum", () => {
  const rows = vereinsAggregat([
    event("eins", [game(), game([ferdinand, marco], true)], [
      low(ferdinand, 21, false), low("Ferdinand Schneck", 18, true),
    ]),
    event("zwei", [game(["Ferdinand Schneck"]), game(["Ferdinand Schneck", marco], true)], [
      low("  Schneck,   Ferdinand  ", 15, false), low(ferdinand, 12, true),
      low("Ferdinand Schneck", 17, false), low(ferdinand, 14, true),
    ]),
  ]);
  assert.equal(rows.length, 2);
  const row = rows.find((spieler) => spieler.anzeige === "Ferdinand Schneck");
  assert.deepEqual(lowValues(row), { gesamt: 12, einzel: 15, doppel: 12 });
  assert.equal(row.spieltage, 2);
  assert.equal(row.einzelSiege, 2);
  assert.equal(row.doppelSiege, 2);
});

for (const doppel of [false, true]) {
  test(`Ein Altwert ohne Tag bleibt unbekannt trotz ausschließlich ${doppel ? "Doppel" : "Einzel"}-Teilnahme`, () => {
    const [row] = vereinsAggregat([event("alt", [game(doppel ? [ferdinand, marco] : [ferdinand], doppel)], [low(ferdinand, 15)], true)])
      .filter((spieler) => spieler.anzeige === "Ferdinand Schneck");
    assert.deepEqual(lowValues(row), { gesamt: 15, einzel: null, doppel: null });
  });
}

test("Unbekannte bessere Altwerte verändern nur den weiterhin unveränderten Gesamtrekord", () => {
  const [row] = vereinsAggregat([event("gemischt", [game()], [
    low(ferdinand, 18, false), low(ferdinand, 15, true), low(ferdinand, 12),
  ])]);
  assert.deepEqual(lowValues(row), { gesamt: 12, einzel: 18, doppel: 15 });
});

test("Gegner und an diesem Spieltag nicht beteiligte Vereinsmitglieder werden ignoriert", () => {
  const rows = vereinsAggregat([
    event("vorher", [game()], [low(ferdinand, 21, false)]),
    event("aktuell", [game([marco])], [
      low(marco, 18, false), low(ferdinand, 9, false), low("Gegner, Eins", 9, true),
    ]),
  ]);
  assert.equal(rows.length, 2);
  assert.deepEqual(lowValues(rows.find((row) => row.anzeige === "Ferdinand Schneck")), { gesamt: 21, einzel: 21, doppel: null });
  assert.deepEqual(lowValues(rows.find((row) => row.anzeige === "Marco Jauch")), { gesamt: 18, einzel: 18, doppel: null });
});

test("Andere Bestleistungen und Spielzahlen bleiben erhalten; eingefrorene Rohberichte werden nicht verändert", () => {
  const input = freezeDeep([event("stabil", [game(), game([ferdinand, marco], true)], [
    low(ferdinand, 18, false), low(ferdinand, 15, true),
    { kategorie: "180", anzahl: 2, wert: 180, name: ferdinand, mannschaft: "TSG 08 Roth VI" },
    { kategorie: "highfinish", anzahl: 1, wert: 120, name: ferdinand, mannschaft: "TSG 08 Roth VI" },
  ])]);
  const vorher = JSON.stringify(input);
  const row = vereinsAggregat(input).find((spieler) => spieler.anzeige === "Ferdinand Schneck");
  assert.equal(row.anzahl180, 2);
  assert.equal(row.besterFinish, 120);
  assert.equal(row.spieltage, 1);
  assert.equal(row.einzelSiege, 1);
  assert.equal(row.doppelSiege, 1);
  assert.equal(row.legsGewonnen, 6);
  assert.equal(row.legsVerloren, 2);
  assert.deepEqual(lowValues(row), { gesamt: 15, einzel: 18, doppel: 15 });
  assert.equal(JSON.stringify(input), vorher);
});
