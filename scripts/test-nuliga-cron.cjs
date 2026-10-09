// Gezielte Prüfung der echten Cron-Authentifizierung und GET-Route.
// Ausschließlich Fixture-Umgebung und nachgebildeter globaler Sync; keine
// echten Secrets, HTTP-Aufrufe, Datenbankänderungen oder Cron-Ausführung.
// Aufruf: node scripts/test-nuliga-cron.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const fixtureSecret = "fixture-cron-secret-0123456789";
const fixtureResult = {
  ok: true, teams: 6, erfolgreich: 6, fehlgeschlagen: 0,
  neu: 2, aktualisiert: 3, unveraendert: 25,
  ergebnisseNeu: 6, ergebnisseAktualisiert: 2,
  berichteNeu: 6, berichteAktualisiert: 1, ergebnisse: [],
};
function load(file, modules, fixtureEnv) {
  const filename = path.join(root, file);
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(js, {
    exports,
    require: (name) => { assert.ok(Object.hasOwn(modules, name), `Unerwartete Route-Abhängigkeit: ${name}`); return modules[name]; },
    process: { env: fixtureEnv }, Response, Request, Date,
  }, { filename });
  return exports;
}
function harness({ secret = fixtureSecret, result = fixtureResult, fail = false } = {}) {
  const fixtureEnv = secret === null ? {} : { CRON_SECRET: secret };
  const calls = [];
  const auth = load("src/lib/cron-auth.ts", { "server-only": {} }, fixtureEnv);
  const route = load("src/app/api/nuliga-sync/route.ts", {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/cron-auth": auth,
    "@/lib/nuliga-sync": { syncAllNuligaTeams: async (...args) => {
      calls.push(args);
      if (fail) throw Error("Fixture: interne DB-Adresse oder Secret darf nicht angezeigt werden.");
      return result;
    } },
  }, fixtureEnv);
  const request = (authorization) => new Request("https://fixture.invalid/api/nuliga-sync", {
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });
  return { calls, auth, route, get: (authorization) => route.GET(request(authorization)), request };
}

(async () => {
  let checks = 0;
  async function check(label, run) { await run(); checks++; console.log(`OK ${label}`); }
  for (const [label, secret, header] of [
    ["Fehlende Secret-Konfiguration", null, `Bearer ${fixtureSecret}`],
    ["Leere Secret-Konfiguration", "", `Bearer ${fixtureSecret}`],
    ["Nur Leerzeichen als Secret", "   ", "Bearer"],
    ["Secret unter 16 Zeichen", "123456789012345", "Bearer 123456789012345"],
    ["Fehlender Authorization-Header", fixtureSecret, undefined],
    ["Falsches Secret", fixtureSecret, "Bearer wrong-fixture-secret-0123456789"],
    ["Falsches Authentifizierungsschema", fixtureSecret, `Basic ${fixtureSecret}`],
    ["Falsche Schreibweise des Bearer-Schemas", fixtureSecret, `bearer ${fixtureSecret}`],
    ["Doppeltes Leerzeichen im Bearer-Header", fixtureSecret, `Bearer  ${fixtureSecret}`],
  ]) {
    await check(`${label}: 401, kein globaler Sync`, async () => {
      const h = harness({ secret });
      const response = await h.get(header);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "Nicht autorisiert." });
      assert.equal(h.calls.length, 0);
    });
  }
  await check("Genau 16 Zeichen als Secret genügen nur mit korrekt passendem Bearer", async () => {
    const secret = "1234567890123456";
    const h = harness({ secret });
    assert.equal(h.auth.cronAuthorizationError(h.request(`Bearer ${secret}`)), null);
    assert.equal((await h.get(`Bearer ${secret}`)).status, 200);
    assert.equal(h.calls.length, 1);
  });
  await check("Korrektes Bearer startet exakt einen globalen Sync ohne Mannschaftsargumente", async () => {
    const h = harness();
    const response = await h.get(`Bearer ${fixtureSecret}`);
    assert.equal(response.status, 200);
    assert.equal(h.calls.length, 1);
    assert.deepEqual(h.calls[0], []);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const body = await response.json();
    const { ausgefuehrtAm, ...data } = body;
    assert.deepEqual(data, fixtureResult);
    assert.match(ausgefuehrtAm, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(Number.isFinite(Date.parse(ausgefuehrtAm)));
  });
  await check("Konfigurations-Leerzeichen werden beim Secret entfernt", async () => {
    const h = harness({ secret: `  ${fixtureSecret}  ` });
    const response = await h.get(`Bearer ${fixtureSecret}`);
    assert.equal(response.status, 200);
    assert.equal(h.calls.length, 1);
  });
  await check("Teilfehler aus dem globalen Sync bleiben im JSON-Ergebnis sichtbar", async () => {
    const result = { ...fixtureResult, ok: false, erfolgreich: 5, fehlgeschlagen: 1, ergebnisse: [{ teamId: "team-5", ok: false, fehler: ["Spielbericht nicht erreichbar"] }] };
    const h = harness({ result });
    const response = await h.get(`Bearer ${fixtureSecret}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.equal(body.fehlgeschlagen, 1);
    assert.deepEqual(body.ergebnisse, result.ergebnisse);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.equal(h.calls.length, 1);
  });
  await check("Unerwarteter Syncfehler liefert 503 ohne Cache und ohne interne Details", async () => {
    const h = harness({ fail: true });
    const response = await h.get(`Bearer ${fixtureSecret}`);
    assert.equal(response.status, 503);
    assert.equal(h.calls.length, 1);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    assert.deepEqual(await response.json(), { error: "Der automatische nuLiga-Abgleich konnte nicht gestartet werden." });
  });
  await check("Route wird dynamisch ausgeführt und hat 300 Sekunden Laufzeitbudget", async () => {
    const h = harness();
    assert.equal(h.route.dynamic, "force-dynamic");
    assert.equal(h.route.maxDuration, 300);
    assert.equal(h.calls.length, 0);
  });
  console.log(`${checks} gezielte Cron-Auth-/Route-Prüfungen bestanden. Ausschließlich Fixture-Secrets und lokaler Sync-Double.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
