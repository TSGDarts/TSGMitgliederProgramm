// Echte EventsCalendar-Funktion + echter Altershelper, feste Berliner Zeit.
// Lokale Datenbank-/JSX-Doubles: kein Browser, Login, Live-GET oder Netzwerk.
// Aufruf: node scripts/test-birthday-calendar.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const jsx = (type, props) => ({ type, props: props ?? {} });
function load(file, modules, fixtureDate) {
  const filename = path.join(root, file);
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(js, {
    exports, Date: fixtureDate, Intl, Set, Map,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      assert.ok(Object.hasOwn(modules, name), `Nicht erwartete Kalender-Abhängigkeit: ${name}`);
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
const people = [
  { full_name: "Jonas Mayer", birthday: "2026-12-28", birthday_public: true, is_active: true },
  { full_name: "Future Year", birthday: "2036-12-28", birthday_public: true, is_active: true },
  { full_name: "Real Round", birthday: "1996-12-28", birthday_public: true, is_active: true },
  { full_name: "January Unknown", birthday: "2026-01-15", birthday_public: true, is_active: true },
  { full_name: "January Real", birthday: "1996-01-15", birthday_public: true, is_active: true },
  { full_name: "Boundary Year", birthday: "2025-01-15", birthday_public: true, is_active: true },
  { full_name: "Not Shared", birthday: "1996-12-28", birthday_public: false, is_active: true },
  { full_name: "Inactive", birthday: "1996-12-28", birthday_public: true, is_active: false },
  { full_name: "Missing Birthday", birthday: null, birthday_public: true, is_active: true },
];
async function harness(monat, now = "2026-10-18T12:00:00Z") {
  class FixtureDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); }
  }
  const queries = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "fixture-member" } } }) },
    from(table) {
      assert.ok(["events", "profiles", "tournaments"].includes(table));
      const query = {
        table, selection: "", filters: [],
        select(columns) { this.selection = columns; return this; },
        eq(column, value) { this.filters.push(["eq", column, value]); return this; },
        not(column, operator, value) { this.filters.push(["not", column, operator, value]); return this; },
        or() { return this; }, lt() { return this; }, gte() { return this; }, order() { return this; },
        maybeSingle: async () => ({ data: { training_default_rsvp: null }, error: null }),
        then(resolve, reject) {
          queries.push({ table: this.table, selection: this.selection, filters: [...this.filters] });
          const rows = table === "profiles" ? people.filter((person) => this.filters.every(([op, field, value, expected]) =>
            op === "eq" ? person[field] === value : value === "is" && expected === null ? person[field] !== null : false)) : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const ageHelper = load("src/lib/geburtstag.ts", {}, FixtureDate);
  const Component = load("src/components/EventsCalendar.tsx", {
    "next/link": { default: "Link" },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/member-queries": { getAllTeams: async () => [] },
    "@/lib/settings": { getEventArchiveDays: async () => 30 },
    "@/lib/format": { formatTime: () => "20:00" },
    "@/lib/types": { brauchtRueckmeldung: () => false },
    "@/lib/feiertage": { feiertageBayern: () => [] },
    "@/lib/geburtstag": ageHelper,
    "@/components/CalendarEventChip": { CalendarEventChip: "CalendarEventChip" },
    "@/components/MonthPicker": { MonthPicker: "MonthPicker" },
    "@/components/KalenderZoom": { KalenderZoom: "KalenderZoom" },
  }, FixtureDate).EventsCalendar;
  const tree = await Component({ base: "/mitglieder/kalender", monat });
  const birthday = (name) => nodes(tree).find((node) => node.type === "div" && typeof node.props.title === "string" && node.props.title.startsWith(`${name} `));
  return { tree, birthday, queries };
}

(async () => {
  let checks = 0;
  async function check(label, run) { await run(); checks++; console.log(`OK ${label}`); }
  await check("Jonas bleibt im Dezember 2026 sichtbar, ohne erfundenes Alter 0", async () => {
    const h = await harness("2026-12");
    assert.equal(h.birthday("Jonas Mayer")?.props.title, "Jonas Mayer hat Geburtstag 🎂");
    assert.ok(textOf(h.birthday("Jonas Mayer")).includes("Jonas Mayer"));
    assert.ok(!h.birthday("Jonas Mayer").props.title.includes("wird"));
  });
  await check("Zukünftiges Geburtsjahr erzeugt weder negatives Alter noch negativen runden Geburtstag", async () => {
    const h = await harness("2026-12");
    assert.equal(h.birthday("Future Year")?.props.title, "Future Year hat Geburtstag 🎂");
    assert.ok(!h.birthday("Future Year").props.title.includes("-10"));
  });
  await check("Vorschau Januar 2027 erzeugt bei Geburtsjahr 2026 kein Alter 1", async () => {
    const h = await harness("2027-01");
    assert.equal(h.birthday("January Unknown")?.props.title, "January Unknown hat Geburtstag 🎂");
    assert.ok(textOf(h.birthday("January Unknown")).includes("January Unknown"));
  });
  await check("Plausibles Geburtsjahr 1996 zeigt weiterhin den echten 30. Geburtstag", async () => {
    const h = await harness("2026-12");
    assert.equal(h.birthday("Real Round")?.props.title, "Real Round wird 30 Jahre 🎂");
  });
  await check("Jahresvorschau zählt bei plausiblem Geburtsjahr im angezeigten Jahr richtig weiter", async () => {
    const h = await harness("2027-01");
    assert.equal(h.birthday("January Real")?.props.title, "January Real wird 31 Jahre 🎂");
  });
  await check("Kalender behält Freigabe-/Aktiv-/Nicht-null-Filter und zeigt keine ausgeschlossenen Personen", async () => {
    const h = await harness("2026-12");
    const query = h.queries.find((entry) => entry.table === "profiles" && entry.selection === "full_name, birthday");
    assert.ok(query);
    assert.deepEqual(query.filters, [["eq", "birthday_public", true], ["eq", "is_active", true], ["not", "birthday", "is", null]]);
    for (const name of ["Not Shared", "Inactive", "Missing Birthday"]) assert.equal(h.birthday(name), undefined);
  });
  await check("Altersprüfung verwendet das aktuelle Berliner Jahr statt UTC oder Vorschaujahr", async () => {
    // UTC ist noch 2025, Berlin bereits 2026: Geburtsjahr 2026 bleibt unbekannt.
    const h = await harness("2027-01", "2025-12-31T23:30:00Z");
    assert.equal(h.birthday("January Unknown")?.props.title, "January Unknown hat Geburtstag 🎂");
    assert.equal(h.birthday("January Real")?.props.title, "January Real wird 31 Jahre 🎂");
    assert.equal(h.birthday("Boundary Year")?.props.title, "Boundary Year wird 2 Jahre 🎂");
  });
  console.log(`${checks} gezielte Geburtstags-Kalender-Prüfungen bestanden. Echte Calendar-Funktion/Altershelper, lokale DB-/JSX-Doubles.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
