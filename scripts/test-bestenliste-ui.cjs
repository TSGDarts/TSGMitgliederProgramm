// Gezielte UI-Regression mit echter Bestenliste und echtem Berechnungshelper.
// JSX/useState/Link sind lokale Doubles; keine Browser-, DB- oder Netzprüfung.
// Aufruf: node scripts/test-bestenliste-ui.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const jsx = (type, props) => ({ type, props: props ?? {} });
function load(file, modules = {}) {
  const filename = path.join(root, file);
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(js, {
    exports, Intl, Set,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      assert.ok(Object.hasOwn(modules, name), `Nicht erwartete Abhängigkeit: ${name}`);
      return modules[name];
    },
  }, { filename });
  return exports;
}
const helper = load("src/lib/bestenliste.ts");
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
const labelOf = (node) => textOf(node).replace(/[▲▼]/g, "").trim();
function player(name, singles, doubles, extra = {}) {
  const [einzelSiege, einzelNiederlagen, einzelLegsGewonnen, einzelLegsVerloren] = singles;
  const [doppelSiege, doppelNiederlagen, doppelLegsGewonnen, doppelLegsVerloren] = doubles;
  return {
    anzeige: name, spieltage: 3,
    einzelSiege, einzelNiederlagen, doppelSiege, doppelNiederlagen,
    einzelLegsGewonnen, einzelLegsVerloren, doppelLegsGewonnen, doppelLegsVerloren,
    legsGewonnen: einzelLegsGewonnen + doppelLegsGewonnen,
    legsVerloren: einzelLegsVerloren + doppelLegsVerloren,
    anzahl180: 0, besterFinish: null, besterLowDarts: null, ...extra,
  };
}
const anna = player("Anna Sieg", [2, 1, 6, 4], [0, 1, 1, 3], { anzahl180: 2, besterFinish: 100, besterLowDarts: 18 });
const bert = player("Bert Doppel", [0, 0, 0, 0], [4, 2, 12, 8]);
const clara = player("Clara Einzel", [2, 2, 8, 8], [0, 0, 0, 0]);
const dora = player("Dora Verlust", [0, 2, 1, 6], [0, 1, 2, 3]);
const emil = player("Emil NurDoppel", [0, 0, 0, 0], [1, 0, 3, 1]);
const fiona = player("Fiona NurEinzel", [1, 0, 3, 0], [0, 0, 0, 0]);
const gerd = player("Gerd Gewicht", [3, 2, 11, 9], [0, 0, 0, 0], { besterFinish: 120, besterLowDarts: 15 });
// Absichtlich keine vorab sortierten Daten: die Component muss selbst sortieren.
const liste = [dora, emil, clara, anna, bert, fiona, gerd];
const saisons = [
  { label: "Gesamt", liste },
  { label: "2025/26", liste: [player("Zoe Archiv", [0, 0, 0, 0], [1, 1, 5, 4]), player(anna.anzeige, [0, 1, 1, 3], [2, 1, 7, 5])] },
  { label: "Nur Einzel", liste: [clara] },
];
const defaultOrder = [gerd.anzeige, bert.anzeige, anna.anzeige, clara.anzeige, fiona.anzeige, emil.anzeige, dora.anzeige];
function harness(input = saisons) {
  const state = [];
  let cursor = 0;
  const Component = load("src/components/Bestenliste.tsx", {
    react: { useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    } },
    "next/link": { default: "Link" },
    "@/lib/bestenliste": helper,
  }).Bestenliste;
  const render = () => { cursor = 0; return Component({ saisons: input }); };
  const button = (label) => nodes(render()).find((node) => node.type === "button" && labelOf(node) === label);
  const header = (label) => nodes(render()).find((node) => node.type === "th" && labelOf(node) === label);
  const rows = () => nodes(render()).filter((node) => node.type === "tr" && typeof node.props.onClick === "function");
  const rowName = (row) => textOf(nodes(row).find((node) => node.type === "Link"));
  const row = (name) => rows().find((item) => rowName(item) === name);
  const cell = (name, label) => {
    const headers = nodes(render()).filter((node) => node.type === "th");
    const index = headers.findIndex((node) => labelOf(node) === label);
    assert.ok(index >= 0, `Spalte fehlt: ${label}`);
    const selected = row(name);
    assert.ok(selected, `Spieler fehlt: ${name}`);
    return nodes(selected).filter((node) => node.type === "td")[index];
  };
  return {
    render, button, header, rows, row, cell,
    order: () => rows().map(rowName),
    click(label) { const selected = button(label); assert.ok(selected, `Button fehlt: ${label}`); selected.props.onClick(); },
  };
}

let checks = 0;
function check(label, run) { run(); checks++; console.log(`OK ${label}`); }
try {
  check("Standardrangfolge gewichtet Einzel 2/Doppel 1 und entscheidet Gleichstand per Leg-Differenz", () => {
    const h = harness();
    assert.deepEqual(h.order(), defaultOrder);
    assert.equal(textOf(h.cell(gerd.anzeige, "Punkte")), "6");
    assert.equal(textOf(h.cell(bert.anzeige, "Punkte")), "4");
    assert.equal(textOf(h.cell(anna.anzeige, "Punkte")), "4");
    assert.equal(h.header("Punkte").props["aria-sort"], "descending");
    assert.equal(h.button("Einzel & Doppel").props["aria-pressed"], true);
    assert.ok(textOf(h.render()).includes("Einzelsieg: 2 Punkte · Doppelsieg: 1 Punkt"));
    assert.ok(textOf(h.render()).includes("Leg-Differenz"));
  });
  check("Gesamtansicht zeigt ungewichtete Siegquote und getrennte Einzel-/Doppelbilanzen samt Quoten", () => {
    const h = harness();
    assert.equal(textOf(h.cell(anna.anzeige, "Siegquote")), "50 %");
    assert.equal(textOf(h.cell(anna.anzeige, "Einzel (S–N)")), "2–166,7 %");
    assert.equal(textOf(h.cell(anna.anzeige, "Doppel (S–N)")), "0–10 %");
    assert.equal(textOf(h.cell(bert.anzeige, "Einzel (S–N)")), "0–0–");
    const legs = h.cell(anna.anzeige, "Legs (Diff.)");
    assert.equal(textOf(nodes(legs).find((node) => node.type === "span" && node.props.title === "Leg-Differenz")), "0");
    assert.equal(textOf(legs), "7:70");
  });
  check("Einzel-Button zeigt eigene Punkte, Legs, Quote, Spiele und S/N; reine Doppelspieler verschwinden", () => {
    const h = harness(); h.click("Einzel");
    assert.deepEqual(h.order(), [gerd.anzeige, anna.anzeige, clara.anzeige, fiona.anzeige, dora.anzeige]);
    assert.equal(h.button("Einzel").props["aria-pressed"], true);
    assert.equal(textOf(h.cell(anna.anzeige, "Punkte")), "4");
    assert.equal(textOf(h.cell(anna.anzeige, "Legs (Diff.)")), "6:4+2");
    assert.equal(textOf(h.cell(anna.anzeige, "Siegquote")), "66,7 %");
    assert.equal(textOf(h.cell(anna.anzeige, "Spiele")), "3");
    assert.equal(textOf(h.cell(anna.anzeige, "Siege")), "2");
    assert.equal(textOf(h.cell(anna.anzeige, "Niederlagen")), "1");
    assert.equal(textOf(h.cell(dora.anzeige, "Siegquote")), "0 %");
    assert.equal(textOf(h.cell(dora.anzeige, "Spiele")), "2");
  });
  check("Doppel-Button verwendet nur Doppelwerte und behält Spieler mit ausschließlich Niederlagen", () => {
    const h = harness(); h.click("Doppel");
    assert.deepEqual(h.order(), [bert.anzeige, emil.anzeige, dora.anzeige, anna.anzeige]);
    assert.equal(textOf(h.cell(anna.anzeige, "Punkte")), "0");
    assert.equal(textOf(h.cell(anna.anzeige, "Legs (Diff.)")), "1:3-2");
    assert.equal(textOf(h.cell(anna.anzeige, "Siegquote")), "0 %");
    assert.equal(textOf(h.cell(anna.anzeige, "Spiele")), "1");
    assert.equal(textOf(h.cell(bert.anzeige, "Punkte")), "4");
    assert.equal(textOf(h.cell(bert.anzeige, "Legs (Diff.)")), "12:8+4");
    assert.equal(textOf(h.cell(bert.anzeige, "Siegquote")), "66,7 %");
    assert.equal(textOf(h.cell(bert.anzeige, "Siege")), "4");
    assert.equal(textOf(h.cell(bert.anzeige, "Niederlagen")), "2");
  });
  check("Saisonwechsel erhält den gewählten Modus und berechnet dessen Werte aus der neuen Saison", () => {
    const h = harness(); h.click("Doppel"); h.click("2025/26");
    assert.equal(h.button("Doppel").props["aria-pressed"], true);
    assert.equal(h.button("2025/26").props["aria-pressed"], true);
    assert.deepEqual(h.order(), [anna.anzeige, "Zoe Archiv"]);
    assert.equal(textOf(h.cell(anna.anzeige, "Punkte")), "2");
    assert.equal(textOf(h.cell(anna.anzeige, "Legs (Diff.)")), "7:5+2");
    assert.equal(textOf(h.cell(anna.anzeige, "Siegquote")), "66,7 %");
    h.click("Gesamt");
    assert.deepEqual(h.order(), [bert.anzeige, emil.anzeige, dora.anzeige, anna.anzeige]);
  });
  check("Spaltenklick sortiert Namen auf- und absteigend und kennzeichnet die Richtung", () => {
    const h = harness(); h.click("Spieler");
    const names = [anna, bert, clara, dora, emil, fiona, gerd].map((row) => row.anzeige);
    assert.deepEqual(h.order(), names);
    assert.equal(h.header("Spieler").props["aria-sort"], "ascending");
    h.click("Spieler");
    assert.deepEqual(h.order(), [...names].reverse());
    assert.equal(h.header("Spieler").props["aria-sort"], "descending");
  });
  check("Siegquote sortiert numerisch in beide Richtungen; Punkte-Klick stellt Standardrangfolge wieder her", () => {
    const h = harness(); h.click("Siegquote");
    assert.deepEqual(h.order(), [fiona.anzeige, emil.anzeige, bert.anzeige, gerd.anzeige, anna.anzeige, clara.anzeige, dora.anzeige]);
    h.click("Siegquote");
    assert.deepEqual(h.order(), [dora.anzeige, anna.anzeige, clara.anzeige, gerd.anzeige, bert.anzeige, fiona.anzeige, emil.anzeige]);
    assert.equal(h.header("Siegquote").props["aria-sort"], "ascending");
    h.click("Punkte");
    assert.deepEqual(h.order(), defaultOrder);
    assert.equal(h.header("Punkte").props["aria-sort"], "descending");
    h.click("Punkte");
    assert.equal(h.order()[0], dora.anzeige);
    assert.equal(h.header("Punkte").props["aria-sort"], "ascending");
  });
  check("Leg-Sortierung nutzt die aktive Disziplin; Moduswechsel stellt gewichtete Punktesortierung wieder her", () => {
    const h = harness(); h.click("Einzel"); h.click("Legs (Diff.)");
    assert.deepEqual(h.order(), [fiona.anzeige, gerd.anzeige, anna.anzeige, clara.anzeige, dora.anzeige]);
    h.click("Legs (Diff.)");
    assert.deepEqual(h.order(), [dora.anzeige, clara.anzeige, gerd.anzeige, anna.anzeige, fiona.anzeige]);
    h.click("Einzel & Doppel");
    assert.deepEqual(h.order(), defaultOrder);
    assert.equal(h.header("Punkte").props["aria-sort"], "descending");
  });
  check("Fehlende Bestleistungswerte stehen bei beiden Sortierrichtungen am Ende", () => {
    const h = harness(); h.click("Kürzestes Leg");
    assert.deepEqual(h.order().slice(0, 2), [gerd.anzeige, anna.anzeige]);
    h.click("Kürzestes Leg");
    assert.deepEqual(h.order().slice(0, 2), [anna.anzeige, gerd.anzeige]);
  });
  check("Zeilenmarkierung bleibt beim Sortieren/Moduswechsel bestehen und lässt sich entfernen", () => {
    const h = harness(); h.row(anna.anzeige).props.onClick();
    assert.match(h.row(anna.anzeige).props.className, /bg-primary\/15/);
    assert.equal(textOf(nodes(h.row(anna.anzeige)).find((node) => node.type === "td")), "📌");
    h.click("Siegquote"); h.click("Doppel");
    assert.match(h.row(anna.anzeige).props.className, /bg-primary\/15/);
    h.row(anna.anzeige).props.onClick();
    assert.ok(!h.row(anna.anzeige).props.className.includes("bg-primary/15"));
  });
  check("Spielername behält Detail-Link und stoppt Zeilenmarkierung beim Namenklick", () => {
    const h = harness();
    const link = nodes(h.row(anna.anzeige)).find((node) => node.type === "Link");
    assert.equal(link.props.href, "/mitglieder/statistiken?spieler=Anna%20Sieg");
    let stopped = false;
    link.props.onClick({ stopPropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.ok(!h.row(anna.anzeige).props.className.includes("bg-primary/15"));
  });
  check("Leere Disziplin und fehlende Saisons zeigen einen passenden Tabellenzustand ohne falsche Teilnehmer", () => {
    const h = harness(); h.click("Doppel"); h.click("Nur Einzel");
    assert.equal(h.rows().length, 0);
    assert.ok(textOf(h.render()).includes("In dieser Auswahl sind noch keine Spiele erfasst."));
    const tree = h.render();
    const empty = nodes(tree).find((node) => node.type === "td" && node.props.colSpan);
    assert.equal(empty.props.colSpan, nodes(tree).filter((node) => node.type === "th").length);
    const noSeasons = harness([]);
    assert.equal(noSeasons.rows().length, 0);
    assert.ok(textOf(noSeasons.render()).includes("In dieser Auswahl sind noch keine Spiele erfasst."));
  });
  console.log(`${checks} gezielte Bestenlisten-UI-Prüfungen bestanden. Lokale React/JSX-Doubles, echte Component und Helper.`);
} catch (error) { console.error(error); process.exitCode = 1; }
