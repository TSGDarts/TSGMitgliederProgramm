// Gezielte Regression für den gemeinsamen manuellen nuLiga-Abgleich.
// Echte Action, Meldungsformatierung, Component und Seite; globaler Sync und
// React-Hooks werden lokal nachgebildet. Kein Login-/DB-/Browser-/Cronnachweis.
// Aufruf: node scripts/test-nuliga-all-manual.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const jsx = (type, props) => ({ type, props: props ?? {} });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "Fragment" };
function load(file, modules = {}) {
  const filename = path.join(root, file);
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(js, {
    exports, require: (name) => modules[name] ?? (name === "react/jsx-runtime" ? jsxRuntime : {}),
    Date, URL, AbortSignal, console,
  }, { filename });
  return exports;
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
function textOf(tree) {
  if (tree == null || typeof tree === "boolean") return "";
  if (Array.isArray(tree)) return tree.map(textOf).join("");
  return typeof tree === "object" ? textOf(tree.props?.children) : String(tree);
}

const formatter = load("src/lib/nuliga-sync.ts").formatNuligaSyncMessage;
function resultFixture(failedIndex = -1) {
  const names = ["I", "II", "III", "IV", "V", "VI"];
  const ergebnisse = names.map((name, index) => ({
    teamId: `team-${index + 1}`, teamName: `TSG 08 Roth ${name}`, ok: index !== failedIndex,
    gefunden: 5, neu: 0, aktualisiert: 0, unveraendert: 5, verlegt: 0, verwaist: 0,
    gegnerErkannt: 5, gegnerNeu: 0, adressenErgaenzt: 0, nichtZugeordnet: 0,
    statistik: {
      ergebnisseNeu: 1, ergebnisseAktualisiert: 0, ergebnisseUnveraendert: 4,
      geprueft: 1, neu: index === failedIndex ? 0 : 1, aktualisiert: 0, unveraendert: 0,
      nichtZugeordnet: 0, konflikte: 0, nichtKonfiguriert: false,
      fehler: index === failedIndex ? ["Spielbericht nicht erreichbar (404)"] : [],
    },
    fehler: index === failedIndex ? ["Spielbericht nicht erreichbar (404)"] : [],
  }));
  return {
    ok: failedIndex < 0, teams: 6, erfolgreich: failedIndex < 0 ? 6 : 5, fehlgeschlagen: failedIndex < 0 ? 0 : 1,
    gefunden: 30, neu: 2, aktualisiert: 3, unveraendert: 25, verlegt: 0, verwaist: 0,
    berichteGeprueft: 6, berichteNeu: failedIndex < 0 ? 6 : 5, berichteAktualisiert: 1,
    ergebnisseNeu: 6, ergebnisseAktualisiert: 2, ergebnisse,
  };
}
function actionHarness(input = {}) {
  const trace = [], revalidated = [], argumentsSeen = [];
  const syncResult = input.result ?? resultFixture();
  const action = load("src/app/mitglieder/admin/mannschaften/actions.ts", {
    "@/lib/auth": { requireEditor: async () => { trace.push("auth"); if (input.authorize) return input.authorize(); } },
    "next/cache": { revalidatePath: (value) => revalidated.push(value) },
    "@/lib/nuliga-sync": {
      formatNuligaSyncMessage: formatter,
      syncAllNuligaTeams: async (...args) => { trace.push("syncAll"); argumentsSeen.push(args); if (input.syncError) throw input.syncError; return syncResult; },
      syncNuligaTeam: async () => { throw Error("Einzelmannschaft-Sync darf vom gemeinsamen Button nicht verwendet werden."); },
    },
  }).syncAllNuligaManual;
  return { action, trace, revalidated, argumentsSeen };
}
function renderButton({ state = null, pending = false, configuredTeams = 6, action } = {}) {
  const dispatch = () => {};
  let hookCalls = 0;
  const Component = load("src/app/mitglieder/admin/mannschaften/AllNuligaSyncButton.tsx", {
    react: { useActionState(actualAction, initial) { hookCalls++; assert.equal(actualAction, action); assert.equal(initial, null); return [state, dispatch, pending]; } },
    "@/components/ui": { Button: "Button" },
    "./actions": { syncAllNuligaManual: action },
  }).AllNuligaSyncButton;
  const tree = Component({ configuredTeams });
  assert.equal(hookCalls, 1);
  assert.equal(nodes(tree).find((node) => node.type === "form").props.action, dispatch);
  return tree;
}

(async () => {
  let checks = 0;
  async function check(label, run) { await run(); checks++; console.log(`OK ${label}`); }
  await check("Berechtigung wird abgeschlossen, bevor genau ein globaler Sync startet", async () => {
    let authorize;
    const h = actionHarness({ authorize: () => new Promise((resolve) => { authorize = resolve; }) });
    const running = h.action({ ok: false, message: "Voriger Lauf", teams: [{ teamId: "nur-ein-team" }] });
    assert.deepEqual(h.trace, ["auth"]);
    authorize();
    const result = await running;
    assert.deepEqual(h.trace, ["auth", "syncAll"]);
    assert.equal(h.argumentsSeen.length, 1);
    assert.deepEqual(h.argumentsSeen[0], []);
    assert.equal(result.teams.length, 6);
  });
  await check("Fehlgeschlagene Berechtigung startet keinen Sync und bleibt ein Authfehler", async () => {
    const denied = Error("NEXT_REDIRECT: Nicht berechtigt");
    const h = actionHarness({ authorize: async () => { throw denied; } });
    await assert.rejects(() => h.action(null), (error) => error === denied);
    assert.deepEqual(h.trace, ["auth"]);
    assert.equal(h.argumentsSeen.length, 0);
    assert.equal(h.revalidated.length, 0);
  });
  await check("Erfolg enthält gemeinsame Zähler sowie alle sechs individuellen Ergebnisse", async () => {
    const h = actionHarness();
    const result = await h.action(null);
    assert.equal(result.ok, true);
    assert.match(result.message, /6 Mannschaften abgeglichen: 6 erfolgreich, 0 mit Fehlern/);
    assert.match(result.message, /Termine: 2 neu, 3 aktualisiert/);
    assert.match(result.message, /Ergebnisse: 6 neu, 2 korrigiert/);
    assert.match(result.message, /Liga-Statistik: 6 Spielberichte neu, 1 aktualisiert/);
    assert.equal(result.teams.length, 6);
    result.teams.forEach((team, index) => {
      assert.equal(team.teamId, `team-${index + 1}`);
      assert.equal(team.ok, true);
      assert.match(team.message, /Ergebnisse: 1 neu, 0 korrigiert, 4 unverändert/);
    });
    assert.deepEqual(h.revalidated, ["/mitglieder/admin/mannschaften"]);
  });
  await check("Teilfehler erhält Ergebnisse aller Mannschaften und die individuelle Fehlermeldung", async () => {
    const h = actionHarness({ result: resultFixture(4) });
    const result = await h.action(null);
    assert.equal(result.ok, false);
    assert.match(result.message, /6 Mannschaften abgeglichen: 5 erfolgreich, 1 mit Fehlern/);
    assert.equal(result.teams.length, 6);
    assert.equal(result.teams.filter((team) => team.ok).length, 5);
    assert.equal(result.teams[4].teamName, "TSG 08 Roth V");
    assert.equal(result.teams[4].ok, false);
    assert.match(result.teams[4].message, /Spielbericht nicht erreichbar \(404\)/);
    assert.deepEqual(h.revalidated, ["/mitglieder/admin/mannschaften"]);
  });
  await check("Keine konfigurierte Mannschaft ergibt ausdrücklich keinen erfolgreichen Lauf", async () => {
    const h = actionHarness({ result: { ...resultFixture(), teams: 0, erfolgreich: 0, ergebnisse: [] } });
    const result = await h.action(null);
    assert.equal(result.ok, false);
    assert.match(result.message, /keiner Mannschaft.*nuLiga-iCal-Adresse/);
    assert.equal(result.teams.length, 0);
    assert.equal(h.revalidated.length, 0);
  });
  await check("Unerwarteter Syncfehler wird ohne falschen Erfolg oder interne Fehlerdetails angezeigt", async () => {
    const h = actionHarness({ syncError: Error("internal-test-error") });
    const result = await h.action(null);
    assert.equal(result.ok, false);
    assert.match(result.message, /konnte nicht abgeschlossen werden/);
    assert.match(result.message, /gespeicherte Änderungen bleiben erhalten/);
    assert.ok(!result.message.includes("internal-test-error"));
    assert.equal(result.teams.length, 0);
  });
  await check("Button verwendet die gemeinsame Action und benötigt keine Mannschaftsauswahl", async () => {
    const h = actionHarness();
    const tree = renderButton({ action: h.action });
    const button = nodes(tree).find((node) => node.type === "Button");
    assert.equal(button.props.type, "submit");
    assert.equal(button.props.disabled, false);
    assert.match(textOf(button), /Alle Mannschaften mit nuLiga abgleichen/);
    assert.ok(!nodes(tree).some((node) => node.type === "input" || node.type === "select"));
    assert.ok(nodes(tree).some((node) => node.props?.["aria-live"] === "polite"));
  });
  await check("Laufender Button ist deaktiviert und blendet alte Ergebnisse vollständig aus", async () => {
    const h = actionHarness({ result: resultFixture(4) });
    const state = await h.action(null);
    const tree = renderButton({ action: h.action, state, pending: true });
    assert.equal(nodes(tree).find((node) => node.type === "Button").props.disabled, true);
    assert.match(textOf(tree), /Gleiche alle Mannschaften ab/);
    assert.match(textOf(tree), /Der Abgleich läuft/);
    assert.equal(nodes(tree).filter((node) => node.type === "li").length, 0);
    assert.ok(!textOf(tree).includes(state.message));
    assert.ok(!textOf(tree).includes("404"));
  });
  await check("Ohne konfigurierte Mannschaft ist der Button deaktiviert und erklärt den nächsten Schritt", async () => {
    const tree = renderButton({ action: actionHarness().action, configuredTeams: 0 });
    assert.equal(nodes(tree).find((node) => node.type === "Button").props.disabled, true);
    assert.match(textOf(tree), /Zuerst bei einer Mannschaft die nuLiga-iCal-Adresse speichern/);
  });
  await check("Abgeschlossener Lauf zeigt alle sechs Teams und markiert nur das fehlgeschlagene Team", async () => {
    const h = actionHarness({ result: resultFixture(4) });
    const state = await h.action(null);
    const tree = renderButton({ action: h.action, state });
    const items = nodes(tree).filter((node) => node.type === "li");
    assert.equal(items.length, 6);
    state.teams.forEach((team, index) => {
      assert.ok(textOf(items[index]).includes(team.teamName));
      assert.ok(textOf(items[index]).includes(team.message));
      assert.ok(textOf(items[index]).includes(team.ok ? "Abgeglichen" : "Fehler beim Abgleich"));
    });
    assert.equal(nodes(tree).filter((node) => node.type === "span" && node.props.className === "text-danger").length, 1);
    assert.ok(textOf(tree).includes(state.message));
  });
  await check("Verwaltungsseite integriert genau einen gemeinsamen Button und zählt nur gespeicherte Adressen", async () => {
    const trace = [];
    const teams = resultFixture().ergebnisse.map((team, index) => ({
      id: team.teamId, name: team.teamName, nuliga_ical_url: ["https://fixture.invalid/a.ics", null, "   ", "https://fixture.invalid/b.ics", " https://fixture.invalid/c.ics ", ""][index],
    }));
    const page = load("src/app/mitglieder/admin/mannschaften/page.tsx", {
      "@/lib/auth": { requireEditor: async () => trace.push("auth") },
      "@/lib/member-queries": { getAllTeams: async () => { trace.push("teams"); return teams; } },
      "@/lib/settings": { getSpielModi: async () => ({ liga: "", pokal: "", achter: "" }) },
      "./AllNuligaSyncButton": { AllNuligaSyncButton: "AllNuligaSyncButton" },
    });
    const tree = await page.default();
    assert.deepEqual(trace, ["auth", "teams"]);
    const buttons = nodes(tree).filter((node) => node.type === "AllNuligaSyncButton");
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].props.configuredTeams, 3);
    assert.equal(page.maxDuration, 300);
    assert.match(textOf(tree), /Spielplan, Ergebnisse und Liga-Statistik für alle/);
  });
  console.log(`${checks} gezielte Prüfungen des gemeinsamen manuellen Abgleichs bestanden. Keine Live-Zugriffe.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
