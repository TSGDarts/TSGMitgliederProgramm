// Reine Runden-Zuordnung mit synthetischen vollständigen Saisonspielplänen.
// Keine Datenbank, kein Browser und kein Netzwerk.
// Aufruf: node --test scripts/test-runden.cjs
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
    assert.equal(name, "@/lib/format", `Unerwartete Runden-Abhängigkeit: ${name}`);
    return loadTs(path.join(root, "src/lib/format.ts"));
  }, module, module.exports);
  return module.exports;
}
const { teileInRunden } = loadTs(path.join(root, "src/lib/runden.ts"));

function event(id, startsAt, type = "match", teamId = "team-6") {
  return {
    id, team_id: teamId, title: id, description: null, location: null,
    starts_at: startsAt, ends_at: null, type, source: "nuliga",
    source_uid: `nuliga:${teamId}:${id}`, is_public: true,
    created_by: null, created_at: "2026-08-01T00:00:00Z",
  };
}

function schedule(teamNumber, count = 18) {
  const first = Date.parse("2026-09-18T18:00:00Z");
  return Array.from({ length: count }, (_, index) => event(
    `team-${teamNumber}-spiel-${index + 1}`,
    new Date(first + index * 14 * 86400000).toISOString(),
    "match",
    `team-${teamNumber}`,
  ));
}

for (const [index, name] of ["I", "II", "III", "IV", "V", "VI"].entries()) {
  for (const played of [2, 3]) {
    test(`TSG ${name}: ${played} vergangene Spiele bleiben mit zukünftigem Spielplan in der Hinrunde`, () => {
      const season = schedule(index + 1);
      const cutoff = played === 2 ? "2026-10-15T23:59:59Z" : "2026-10-18T23:59:59Z";
      const result = teileInRunden([...season].reverse(), cutoff);
      assert.deepEqual(result.hinrunde.map((spiel) => spiel.id), season.slice(0, played).map((spiel) => spiel.id));
      assert.deepEqual(result.rueckrunde, []);
      assert.deepEqual(result.sonstige, []);
      if (played === 3) assert.equal(result.hinrunde[2].starts_at.slice(0, 10), "2026-10-16");
    });
  }
}

test("Ohne Zeitgrenze bleibt die vollständige Saison wie bisher in zwei Hälften geteilt", () => {
  const season = schedule(1, 8);
  const result = teileInRunden([...season].reverse());
  assert.deepEqual(result.hinrunde, season.slice(0, 4));
  assert.deepEqual(result.rueckrunde, season.slice(4));
  assert.deepEqual(result.sonstige, []);
  assert.deepEqual(teileInRunden(season, undefined), result);
});

test("Ein tatsächlich begonnener Rückrundenteil bleibt als Rückrunde sichtbar", () => {
  const season = schedule(6, 8);
  const result = teileInRunden(season, season[4].starts_at);
  assert.deepEqual(result.hinrunde, season.slice(0, 4));
  assert.deepEqual(result.rueckrunde, [season[4]]);
});

test("Die Zeitgrenze ist inklusive und vergleicht denselben Zeitpunkt auch mit Zeitzonenoffset", () => {
  const first = event("hinrunde", "2026-09-18T18:00:00Z");
  const atCutoff = event("rueckrunde", "2026-10-18T12:00:00Z");
  const cupAtCutoff = event("pokal-genau", "2026-10-18T14:00:00+02:00", "pokal");
  const friendlyBefore = event("freundschaft-vorher", "2026-10-18T11:59:59.999Z", "friendly");
  const friendlyAfter = event("freundschaft-spaeter", "2026-10-18T12:00:00.001Z", "friendly");
  const cupAfter = event("pokal-spaeter", "2026-10-18T12:00:00.001Z", "pokal");
  const result = teileInRunden(
    [cupAfter, friendlyAfter, atCutoff, first, cupAtCutoff, friendlyBefore],
    "2026-10-18T12:00:00Z",
  );
  assert.deepEqual(result.hinrunde, [first]);
  assert.deepEqual(result.rueckrunde, [atCutoff]);
  assert.deepEqual(result.sonstige, [friendlyBefore, cupAtCutoff]);
  assert.deepEqual(teileInRunden([first, atCutoff], "2026-10-18T11:59:59.999Z").rueckrunde, []);
});

test("Pokal und Freundschaftsspiele beeinflussen die Halbierung der Liga nicht", () => {
  const season = schedule(3, 6);
  const cup = event("pokal", season[1].starts_at, "pokal");
  const friendly = event("freundschaft", season[4].starts_at, "friendly");
  const result = teileInRunden([friendly, ...season, cup]);
  assert.deepEqual(result.hinrunde, season.slice(0, 3));
  assert.deepEqual(result.rueckrunde, season.slice(3));
  assert.deepEqual(result.sonstige, [cup, friendly]);
});

test("Eingabearray und Termine bleiben beim Sortieren und Filtern unverändert", () => {
  const season = schedule(4, 8).reverse();
  const before = structuredClone(season);
  for (const spiel of season) Object.freeze(spiel);
  Object.freeze(season);
  const result = teileInRunden(season, "2026-10-18T23:59:59Z");
  assert.deepEqual(season, before);
  assert.equal(result.hinrunde.length, 3);
  assert.notEqual(result.hinrunde, season);
});
