// Gezielte Parser-Prüfung; kein Netzwerk und keine Datenbank.
// Aufruf: node --test scripts/test-nuliga-lowdarts.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const cache = new Map();
function loadTs(file) {
  const filename = path.resolve(file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  });
  new Function("require", "module", "exports", compiled.outputText)((name) => {
    assert.ok(name.startsWith("./"), `Nur relative Parser-Abhängigkeiten erlaubt: ${name}`);
    return loadTs(path.resolve(path.dirname(filename), `${name}.ts`));
  }, module, module.exports);
  return module.exports;
}
const { parseSpielbericht } = loadTs(path.join(root, "src/lib/spielbericht.ts"));
const { parseNuligaSpielberichtHtml } = loadTs(path.join(root, "src/lib/nuliga-berichte.ts"));
const team = "TSG 08 Roth II";
const opponent = "Example Darts III";
const textReport = (rows, heading = "Bestleistungen Low Darts") => [
  `${team} - ${opponent}, 18.09.2026, 20:00 Uhr`,
  "1-1\tHempel, Max\tBär, Tobias\t3:0\t1:0\t1:0",
  "Legs:\t3:0\t1:0\t1:0",
  heading,
  ...rows,
].join("\n");
const achievement = (...cells) => cells.join("\t");
const requireReport = (result) => {
  assert.equal(result.ok, true, result.fehler);
  return result.bericht;
};

test("Manueller Text belegt Einzel mit vier und Doppel mit fünf Originaltokens", () => {
  const parsed = requireReport(parseSpielbericht(textReport([
    achievement(2, 16, "Jauch, Marco", team),
    achievement(1, 19, "Hempel, Max", "Jauch, Marco", team),
    achievement(1, 15, "Bär, Tobias", opponent),
  ])));
  assert.deepEqual(parsed.bestleistungen, [
    { kategorie: "lowdarts", anzahl: 2, wert: 16, name: "Jauch, Marco", mannschaft: team, doppel: false },
    { kategorie: "lowdarts", anzahl: 1, wert: 19, name: "Hempel, Max", mannschaft: team, doppel: true },
    { kategorie: "lowdarts", anzahl: 1, wert: 19, name: "Jauch, Marco", mannschaft: team, doppel: true },
    { kategorie: "lowdarts", anzahl: 1, wert: 15, name: "Bär, Tobias", mannschaft: opponent, doppel: false },
  ]);
});

test("Unklare Namen-/Teamspalten bleiben ohne Kennzeichnung rückwärtskompatibel", () => {
  const cases = [
    { tokens: [1, 16, "Jauch, Marco", "Unbekannte Mannschaft"], name: "Jauch, Marco", mannschaft: "Unbekannte Mannschaft" },
    { tokens: [1, 19, "Hempel, Max", "Zusatz", team], name: "Hempel, Max", mannschaft: `Zusatz ${team}` },
    { tokens: [1, 19, "Hempel, Max", "Jauch, Marco", "Zusatz", team], name: "Hempel, Max", mannschaft: `Jauch, Marco Zusatz ${team}` },
    { tokens: [1, 19, "Hempel, Max / Jauch, Marco", team], name: "Hempel, Max / Jauch, Marco", mannschaft: team },
  ];
  for (const { tokens, name, mannschaft } of cases) {
    const parsed = requireReport(parseSpielbericht(textReport([achievement(...tokens)])));
    assert.equal(parsed.bestleistungen.length, 1);
    assert.deepEqual(parsed.bestleistungen[0], { kategorie: "lowdarts", anzahl: 1, wert: Number(tokens[1]), name, mannschaft });
  }
});

test("180er und High Finishes erhalten keine Low-Darts-Kennzeichnung", () => {
  for (const heading of ["Bestleistungen 180er", "Bestleistungen High Finishes"]) {
    const parsed = requireReport(parseSpielbericht(textReport([achievement(1, 180, "Jauch, Marco", team)], heading)));
    assert.equal(Object.hasOwn(parsed.bestleistungen[0], "doppel"), false);
  }
});

test("HTML bewahrt die Einzel-/Doppelart aus der ursprünglichen Spielerzelle", () => {
  const html = `<h1>${team} - ${opponent}, 18.09.2026, 20:00 Uhr</h1>
    <h2>Match Report</h2><table><tr><th>&nbsp;</th><th>${team}</th><th>${opponent}</th><th>1. Satz</th><th>Sätze</th><th>Spiele</th></tr>
    <tr><td>1-1</td><td>Jauch, Marco</td><td>B&auml;r, Tobias</td><td>3:0</td><td>1:0</td><td>1:0</td></tr>
    <tr><td colspan="3"></td><td>Legs: 3:0</td><td>1:0</td><td>1:0</td></tr></table>
    <h2>Bestleistungen Low Darts</h2><table>
    <tr><td>2</td><td>16</td><td>Jauch, Marco</td><td>${team}</td></tr>
    <tr><td>1</td><td>19</td><td>Hempel, Max<br/>Jauch, Marco</td><td>${team}</td></tr></table>`;
  const parsed = requireReport(parseNuligaSpielberichtHtml(html));
  assert.deepEqual(parsed.bestleistungen.map(({ name, wert, doppel }) => ({ name, wert, doppel })), [
    { name: "Jauch, Marco", wert: 16, doppel: false },
    { name: "Hempel, Max", wert: 19, doppel: true },
    { name: "Jauch, Marco", wert: 19, doppel: true },
  ]);
});

test("Reale vorhandene Berichte belegen Low-Darts-Einzel und gemeinsame Doppel", (t) => {
  const fixtures = [
    { file: "nuliga-bericht-6112027.html", einzel: { name: "Jauch, Marco", wert: 16 }, doppel: { names: ["Hempel, Max", "Jauch, Marco"], wert: 20 } },
    { file: "nuliga-bericht-6111949.html", einzel: { name: "Krasniqi, Armend", wert: 13 }, doppel: { names: ["Schneck, Ferdinand", "Thanner, Simon"], wert: 19 } },
  ];
  if (fixtures.some(({ file }) => !fs.existsSync(path.join(root, "tmp", file)))) {
    t.skip("Öffentliche HTML-Snapshots fehlen; synthetische Parserfälle laufen unabhängig.");
    return;
  }
  for (const { file, einzel, doppel } of fixtures) {
    const parsed = requireReport(parseNuligaSpielberichtHtml(fs.readFileSync(path.join(root, "tmp", file), "utf8")));
    const lows = parsed.bestleistungen.filter((b) => b.kategorie === "lowdarts");
    assert.ok(lows.some((b) => b.name === einzel.name && b.wert === einzel.wert && b.doppel === false), `${file}: Einzel`);
    for (const name of doppel.names) {
      assert.ok(lows.some((b) => b.name === name && b.wert === doppel.wert && b.doppel === true), `${file}: Doppel ${name}`);
    }
    assert.ok(lows.every((b) => typeof b.doppel === "boolean"), `${file}: alle originalen Low-Darts-Zeilen zugeordnet`);
    assert.ok(parsed.bestleistungen.filter((b) => b.kategorie !== "lowdarts").every((b) => !Object.hasOwn(b, "doppel")));
  }
});
