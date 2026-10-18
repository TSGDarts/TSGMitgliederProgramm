// Gezielte Anzeige-Regression: echte Formatierung, Rundenzuordnung und beide
// Ergebnisse-Seiten mit schmalen DB-/Auth-/JSX-Doubles. Kein Live-/Browsernachweis.
// Aufruf: node --test scripts/test-ergebnis-anzeige.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const now = "2026-10-18T12:00:00.000Z";
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return Date.parse(now); }
}
const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "Fragment" };
function load(file, modules = {}) {
  const filename = path.join(root, file);
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(code, {
    exports, Date: FixedDate,
    require(name) {
      if (name === "react/jsx-runtime") return jsxRuntime;
      assert.ok(Object.hasOwn(modules, name), `Unerwartete Abhängigkeit in ${file}: ${name}`);
      return modules[name];
    },
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

const format = load("src/lib/format.ts");
const runden = load("src/lib/runden.ts", { "@/lib/format": format });
const season = { id: "season-2026", name: "2026/27", status: "active", starts_on: "2026-09-01", ends_on: "2027-05-31" };
const teams = ["I", "II", "III", "IV", "V", "VI"].map((number, i) => ({
  id: `team-${i + 1}`, name: `TSG 08 Roth ${number}`, league: "Testliga", sort_order: i,
}));
// Vollständiger synthetischer Saisonplan: vier vergangene Partien und vierzehn
// zukünftige. Das verhindert, dass der jüngste Oktober-Spieltag nur wegen einer
// zuvor auf vergangene Spiele verkürzten Liste als Rückrunde erscheint.
const dates = [
  "2026-09-25", "2026-10-02", "2026-10-09", "2026-10-16", "2026-10-30", "2026-11-13",
  "2026-11-27", "2026-12-11", "2027-01-08", "2027-01-22", "2027-02-05", "2027-02-19",
  "2027-03-05", "2027-03-19", "2027-04-02", "2027-04-16", "2027-04-30", "2027-05-14",
];
const fixtures = teams.flatMap((team) => dates.map((date, i) => ({
  id: `${team.id}-match-${i}`, team_id: team.id, type: "match", is_public: true,
  title: `${team.name} · Partie ${i + 1}${i >= 4 ? " ZUKUNFT" : ""}`,
  starts_at: `${date}T18:00:00.000Z`, result: ["10:2", "0:12", "6:6", "8:4"][i] ?? "12:0",
  home_away: i < 2 ? "auswaerts" : "heim", match_stats: null,
})));
const events = [...fixtures,
  { ...fixtures[0], id: "vor-saison", title: "VORSAISON", starts_at: "2026-08-31T18:00:00.000Z" },
  { ...fixtures[0], id: "nach-saison", title: "NACHSAISON", starts_at: "2027-06-01T18:00:00.000Z" },
];

function pageHarness(kind) {
  const calls = [];
  const trace = [];
  const client = {
    from(table) {
      assert.ok(["events", "seasons", "teams"].includes(table), `Unerwartete Tabelle ${table}`);
      const operations = [];
      calls.push({ table, operations });
      const query = {};
      for (const method of ["select", "in", "eq", "gte", "lte", "order"]) {
        query[method] = (...args) => { operations.push([method, ...args]); return query; };
      }
      query.then = (resolve, reject) => {
        let data = [...({ events, seasons: [season], teams })[table]];
        for (const [method, key, value] of operations) {
          if (method === "in") data = data.filter((row) => value.includes(row[key]));
          if (method === "eq") data = data.filter((row) => row[key] === value);
          if (method === "gte") data = data.filter((row) => Date.parse(row[key]) >= Date.parse(value));
          if (method === "lte") data = data.filter((row) => Date.parse(row[key]) <= Date.parse(value));
          if (method === "order" && key === "starts_at") data.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
        }
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return query;
    },
  };
  const modules = {
    "next/link": { default: "Link" },
    "@/components/Einklappbar": { Einklappbar: "Einklappbar" },
    "@/components/ui": { PageHeader: "PageHeader", EmptyState: "EmptyState", Badge: "Badge" },
    "@/lib/format": format,
    "@/lib/runden": runden,
    "@/lib/types": { EVENT_TYPE_LABELS: { match: "Punktspiel", pokal: "Pokal", friendly: "Freundschaftsspiel" } },
    "@/lib/auth": { requireProfile: async () => { trace.push("auth"); return { role: "member" }; } },
    "@/lib/member-queries": { getAllTeams: async () => { trace.push("teams"); return teams; } },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": { createAdminSupabase: () => client },
    "@/lib/statistik": { vereinsAggregat: () => { throw Error("Aktive Saison braucht keinen Archiv-Rückblick."); } },
  };
  const file = kind === "member" ? "src/app/mitglieder/ergebnisse/page.tsx" : "src/app/(public)/ergebnisse/page.tsx";
  const page = load(file, modules).default;
  return { calls, trace, render: () => page({ searchParams: Promise.resolve({}) }) };
}

test("Heim:Gast-Anzeige dreht Auswärtssieg und Auswärtsniederlage", () => {
  assert.equal(format.formatErgebnisHeimGast("10:2", "auswaerts"), "2:10");
  assert.equal(format.formatErgebnisHeimGast("0:12", "auswaerts"), "12:0");
  assert.equal(format.formatErgebnisHeimGast(" 10 : 2 ", "auswaerts"), "2:10");
});

test("Heim, Remis, leere oder unbekannte Zuordnung und Freitext bleiben lesbar", () => {
  for (const [result, homeAway, expected] of [
    ["10:2", "heim", "10:2"], ["6:6", "auswaerts", "6:6"], ["", "auswaerts", ""],
    ["  ", "heim", ""], [" 10:2 ", "", "10:2"], ["10:2", null, "10:2"],
    ["10:2", undefined, "10:2"], [" kampflos gewonnen ", "auswaerts", "kampflos gewonnen"],
    ["10:2:1", "auswaerts", "10:2:1"],
  ]) assert.equal(format.formatErgebnisHeimGast(result, homeAway), expected);
});

for (const kind of ["member", "public"]) {
  test(`${kind}: Datenabfrage lädt den vollständigen Saisonplan ohne Jetzt-Grenze`, async () => {
    const h = pageHarness(kind);
    await h.render();
    const query = h.calls.filter(({ table }) => table === "events");
    assert.equal(query.length, 1);
    const bounds = query[0].operations.filter(([method]) => method === "gte" || method === "lte");
    assert.deepEqual(bounds, [
      ["gte", "starts_at", season.starts_on],
      ["lte", "starts_at", `${season.ends_on}T23:59:59Z`],
    ]);
    assert.equal(query[0].operations.some(([method, key, value]) => method === "eq" && key === "is_public" && value === true), kind === "public");
    if (kind === "member") assert.deepEqual(h.trace, ["auth", "teams"]);
  });

  test(`${kind}: vergangene Oktoberpartien aller sechs Teams bleiben Hinrunde; Score und Siegwertung stimmen`, async () => {
    const h = pageHarness(kind);
    const tree = await h.render();
    const contents = textOf(tree);
    for (const forbidden of ["ZUKUNFT", "VORSAISON", "NACHSAISON"]) assert.ok(!contents.includes(forbidden), forbidden);
    const sections = nodes(tree).filter((node) => node.type === "Einklappbar");
    assert.equal(sections.length, 6);
    for (const team of teams) {
      const section = sections.find((node) => node.key === team.id);
      assert.ok(section, team.name);
      assert.match(textOf(section.props.title), /· 4 Spiele/);
      assert.match(textOf(section), /Bilanz 2-1-1/);
      assert.match(textOf(section), /Heim 1-1-0 ·\s*Auswärts 1-0-1/);
      const rounds = nodes(section).filter((node) => node.type === "div" && ["Hinrunde", "Rückrunde"].includes(node.key));
      assert.equal(rounds.length, 1, team.name);
      assert.equal(rounds[0].key, "Hinrunde", team.name);
      for (const i of [1, 2, 3]) assert.ok(textOf(rounds[0]).includes(`${team.name} · Partie ${i + 1}`), `${team.name}: Oktoberpartie ${i + 1}`);
      const expectedBadges = [
        { text: "✅ 2:10", tone: "ok" }, { text: "❌ 12:0", tone: "danger" },
        { text: "➖ 6:6", tone: "neutral" }, { text: "✅ 8:4", tone: "ok" },
      ];
      expectedBadges.forEach((expected, i) => {
        const row = nodes(section).find((node) => node.key === `${team.id}-match-${i}`);
        assert.ok(row, `${team.name} Partie ${i + 1}`);
        const badges = nodes(row).filter((node) => node.type === "Badge");
        assert.equal(badges.length, 1);
        assert.equal(textOf(badges[0]), expected.text);
        assert.equal(badges[0].props.tone, expected.tone);
      });
    }
  });
}
