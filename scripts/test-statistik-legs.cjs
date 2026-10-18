// Echte vereinsweite Aggregation und Namensnormalisierung, ohne DB oder Netzwerk.
// Aufruf: node --test scripts/test-statistik-legs.cjs
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
const plain = (value) => JSON.parse(JSON.stringify(value));
function game(unsere, legs, gewonnen, doppel = false) {
  return { nr: "1-1", doppel, unsere, gegner: doppel ? ["Gegner, Eins", "Gegner, Zwei"] : ["Gegner, Eins"], legs, gewonnen };
}
function report(spiele) {
  return { heim: "TSG 08 Roth", gast: "Gegner", wirSindHeim: true, ergebnis: "10:2", legsGesamt: "30:8", spiele, uebersprungen: 0 };
}
function event(id, spiele) {
  return { id, title: `Spieltag ${id}`, starts_at: `2026-10-0${id}T18:00:00Z`, result: "10:2", match_stats: { nuliga: report(spiele) } };
}
function totals(row) {
  return {
    einzelLegsGewonnen: row.einzelLegsGewonnen, einzelLegsVerloren: row.einzelLegsVerloren,
    doppelLegsGewonnen: row.doppelLegsGewonnen, doppelLegsVerloren: row.doppelLegsVerloren,
    legsGewonnen: row.legsGewonnen, legsVerloren: row.legsVerloren,
  };
}
function freezeDeep(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

test("Einzel zählt Siege/Niederlagen und Legs ohne Doppel-Anteile", () => {
  const [row] = vereinsAggregat([event(1, [
    game(["Schneck, Ferdinand"], "3:1", true), game(["Ferdinand Schneck"], "1:3", false),
  ])]);
  assert.equal(row.einzelSiege, 1);
  assert.equal(row.einzelNiederlagen, 1);
  assert.equal(row.doppelSiege, 0);
  assert.equal(row.doppelNiederlagen, 0);
  assert.deepEqual(totals(row), {
    einzelLegsGewonnen: 4, einzelLegsVerloren: 4, doppelLegsGewonnen: 0, doppelLegsVerloren: 0,
    legsGewonnen: 4, legsVerloren: 4,
  });
  assert.equal(row.spieltage, 1);
});

test("Doppel-Legs und Doppel-Bilanz zählen für beide aufgestellten Spieler", () => {
  const rows = vereinsAggregat([event(1, [
    game(["Schneck, Ferdinand", "Jauch, Marco"], "3:2", true, true),
    game(["Ferdinand Schneck", "Marco Jauch"], "0:3", false, true),
  ])]);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.einzelSiege + row.einzelNiederlagen, 0);
    assert.equal(row.doppelSiege, 1);
    assert.equal(row.doppelNiederlagen, 1);
    assert.deepEqual(totals(row), {
      einzelLegsGewonnen: 0, einzelLegsVerloren: 0, doppelLegsGewonnen: 3, doppelLegsVerloren: 5,
      legsGewonnen: 3, legsVerloren: 5,
    });
  }
});

test("Mehrere Spieltage normalisieren Namen; Summe der Modi entspricht Gesamt-Legs", () => {
  const input = freezeDeep([
    event(1, [
      game(["Schneck, Ferdinand"], "3:1", true), game(["Jauch, Marco"], "0:3", false),
      game(["Ferdinand Schneck", "Jauch, Marco"], "3:2", true, true),
    ]),
    event(2, [
      game(["schneck, ferdinand"], "1:3", false),
      game(["Schneck, Ferdinand", "Marco Jauch"], "0:3", false, true),
    ]),
    event(3, [game(["Jauch, Marco"], "3:0", true)]),
  ]);
  const before = plain(input);
  const rows = vereinsAggregat(input);
  assert.equal(rows.length, 2, "Namensvarianten dürfen keine weiteren Ranglistenzeilen erzeugen.");
  const ferdinand = rows.find((row) => row.anzeige === "Ferdinand Schneck");
  const marco = rows.find((row) => row.anzeige === "Marco Jauch");
  assert.equal(ferdinand.spieltage, 2);
  assert.equal(marco.spieltage, 3);
  assert.deepEqual(totals(ferdinand), {
    einzelLegsGewonnen: 4, einzelLegsVerloren: 4, doppelLegsGewonnen: 3, doppelLegsVerloren: 5,
    legsGewonnen: 7, legsVerloren: 9,
  });
  assert.deepEqual(totals(marco), {
    einzelLegsGewonnen: 3, einzelLegsVerloren: 3, doppelLegsGewonnen: 3, doppelLegsVerloren: 5,
    legsGewonnen: 6, legsVerloren: 8,
  });
  for (const row of rows) {
    assert.equal(row.einzelLegsGewonnen + row.doppelLegsGewonnen, row.legsGewonnen);
    assert.equal(row.einzelLegsVerloren + row.doppelLegsVerloren, row.legsVerloren);
  }
  assert.deepEqual(plain(input), before, "Eingabedaten bleiben unverändert.");
});

test("Fremde MatchStats und gegnerische Bestleistungen ändern die Leg-Zähler nicht", () => {
  const own = event(1, [game(["Schneck, Ferdinand"], "3:1", true)]);
  const expected = plain(vereinsAggregat([own]));
  const foreignReport = report([game(["Fremd, Spieler"], "99:0", true)]);
  const decorated = structuredClone(own);
  decorated.match_stats.dreik = foreignReport;
  decorated.match_stats.nuliga.bestleistungen = [
    { kategorie: "180", name: "Gegner, Eins", anzahl: 100, wert: 180, mannschaft: "Gegner" },
  ];
  const foreignRows = [null, "Text", 42, {}, { dreik: foreignReport }, { quelle: "3k", dreik: foreignReport }]
    .map((match_stats, i) => ({ ...own, id: `foreign-${i}`, match_stats }));
  assert.deepEqual(plain(vereinsAggregat([decorated, ...foreignRows])), expected);
  assert.deepEqual(plain(vereinsAggregat(foreignRows)), []);
});

test("Direkt gespeicherter Altbericht erhält dieselben neuen Leg-Zähler", () => {
  const row = event(1, [game(["Schneck, Ferdinand"], "3:0", true)]);
  const expected = plain(vereinsAggregat([row]));
  assert.deepEqual(plain(vereinsAggregat([{ ...row, match_stats: row.match_stats.nuliga }])), expected);
});

test("Bestehende Aggregat-Sortierung bleibt bei ungewichteten Siegen", () => {
  const rows = vereinsAggregat([event(1, [
    game(["Alpha, Anne"], "3:0", true),
    game(["Zeta, Zoe", "Ypsilon, Yara"], "3:0", true, true),
    game(["Zeta, Zoe", "Ypsilon, Yara"], "3:0", true, true),
  ])]);
  assert.ok(rows.findIndex((row) => row.anzeige === "Zoe Zeta") < rows.findIndex((row) => row.anzeige === "Anne Alpha"));
});
