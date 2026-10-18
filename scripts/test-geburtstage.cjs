// Echter Altershelper und echte Geburtstagsseite mit lokalen DB/Auth/JSX-Doubles.
// Fester Stichtag: 18.10.2026 in Berlin. Keine DB-Schreibzugriffe und kein Netzwerk.
// Aufruf: node --test scripts/test-geburtstage.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const defaultNow = "2026-10-18T10:00:00Z";
const jsx = (type, props) => ({ type, props: props ?? {} });
function load(file, modules = {}, now = defaultNow) {
  const filename = path.join(root, file);
  const exports = {};
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return Date.parse(now); }
  }
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: filename,
  }).outputText;
  vm.runInNewContext(code, {
    exports, Intl, Date: FixedDate,
    require(name) {
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
      assert.ok(Object.hasOwn(modules, name), `Nicht erwartete Abhängigkeit: ${name}`);
      return modules[name];
    },
  }, { filename });
  return exports;
}
const { geburtstagsAlter } = load("src/lib/geburtstag.ts");

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
function section(tree, title) {
  const selected = nodes(tree).find((node) => node.type === "section"
    && nodes(node).some((child) => child.type === "h2" && textOf(child).includes(title)));
  assert.ok(selected, `Abschnitt fehlt: ${title}`);
  return selected;
}
function birthdayCard(tree, name) {
  const selected = nodes(section(tree, "Kommende Geburtstage"))
    .find((node) => node.type === "Card" && textOf(node).includes(name));
  assert.ok(selected, `Geburtstag fehlt: ${name}`);
  return selected;
}
function profile(name, birthday, extra = {}) {
  return { full_name: name, birthday, birthday_public: true, member_since: null, is_active: true, ...extra };
}
function invite(name, birthday, extra = {}) {
  return { full_name: name, birthday, birthday_public: true, left_on: null, claimed: false, ...extra };
}
function harness({ profiles = [], invites = [], now = defaultNow, authError = null } = {}) {
  const state = { authCalls: 0, adminCalls: 0, reads: [], writes: [] };
  const original = JSON.stringify({ profiles, invites });
  const admin = {
    from(table) {
      assert.ok(state.authCalls > 0, "Profilprüfung muss vor dem Lesen der Personendaten erfolgen.");
      assert.ok(table === "profiles" || table === "member_invites", `Unerwartete Tabelle: ${table}`);
      const query = {
        filters: [],
        select(columns) { state.reads.push({ table, columns }); return this; },
        eq(column, value) { this.filters.push((row) => row[column] === value); return this; },
        is(column, value) { return this.eq(column, value); },
        neq(column, value) { this.filters.push((row) => row[column] !== value); return this; },
        then(resolve, reject) {
          const source = table === "profiles" ? profiles : invites;
          const data = structuredClone(source.filter((row) => this.filters.every((filter) => filter(row))));
          return Promise.resolve({ data, error: null }).then(resolve, reject);
        },
      };
      for (const method of ["insert", "upsert", "update", "delete"]) {
        query[method] = () => { state.writes.push(method); assert.fail(`Geburtstagsanzeige darf nicht schreiben: ${method}`); };
      }
      return query;
    },
  };
  // Nur die echte Austrittsprüfung wird aufgerufen; andere Invite-Funktionen
  // dürfen in diesem Lesetest keine Datenbankverbindung öffnen.
  const invitesModule = load("src/lib/invites.ts", {
    "server-only": {},
    "@/lib/supabase/admin": { createAdminSupabase: () => { throw Error("Keine DB-Nebenaufrufe aus Invite-Helfern erlaubt."); } },
  }, now);
  const Page = load("src/app/mitglieder/geburtstage/page.tsx", {
    "@/lib/auth": { requireProfile: async () => {
      state.authCalls++;
      if (authError) throw authError;
      return { id: "test-member", role: "player", is_active: true };
    } },
    "@/lib/supabase/admin": { createAdminSupabase: () => { state.adminCalls++; return admin; } },
    "@/lib/invites": invitesModule,
    "@/lib/geburtstag": { geburtstagsAlter },
    "@/components/ui": { PageHeader: "PageHeader", Card: "Card", CardBody: "CardBody", Badge: "Badge", EmptyState: "EmptyState" },
  }, now).default;
  return {
    state,
    async render() {
      const tree = await Page();
      assert.deepEqual(state.writes, []);
      assert.equal(JSON.stringify({ profiles, invites }), original, "Personendaten dürfen nicht verändert werden.");
      assert.equal(state.authCalls, 1);
      assert.equal(state.adminCalls, 1);
      assert.deepEqual(state.reads.map((read) => read.table).sort(), ["member_invites", "profiles"]);
      return tree;
    },
    renderUnauthorized: () => Page(),
  };
}

test("Altershelper bewahrt plausible Geburtstagsalter einschließlich kommendem Kalenderjahr", () => {
  assert.equal(geburtstagsAlter("1996-12-28", 2026, 2026), 30);
  assert.equal(geburtstagsAlter("1995-12-28", 2026, 2026), 31);
  assert.equal(geburtstagsAlter("1996-01-01", 2027, 2026), 31);
});

test("Aktuelles oder zukünftiges Geburtsjahr bleibt ohne geratenes Alter", () => {
  assert.equal(geburtstagsAlter("2026-12-28", 2026, 2026), null);
  assert.equal(geburtstagsAlter("2026-01-01", 2027, 2026), null);
  assert.equal(geburtstagsAlter("2036-12-28", 2026, 2026), null);
});

test("Ungültige oder nicht positive Jahre liefern kein Alter", () => {
  for (const dob of ["", "kein-datum", "0000-12-28", "-001-12-28"]) {
    assert.equal(geburtstagsAlter(dob, 2026, 2026), null, dob);
  }
  for (const year of [0, -1, 2026.5, NaN, Infinity]) {
    assert.equal(geburtstagsAlter("1996-12-28", year, 2026), null, `Geburtstagsjahr ${year}`);
    assert.equal(geburtstagsAlter("1996-12-28", 2026, year), null, `Aktuelles Jahr ${year}`);
  }
});

test("Alter null oder kleiner als null wird unterdrückt", () => {
  assert.equal(geburtstagsAlter("1996-12-28", 1996, 2026), null);
  assert.equal(geburtstagsAlter("1996-12-28", 1995, 2026), null);
});

test("Jonas am 28.12.2026 zeigt Tag und Monat, aber weder Null noch runden Geburtstag", async () => {
  const tree = await harness({ profiles: [profile("Jonas", "2026-12-28")] }).render();
  const card = birthdayCard(tree, "Jonas");
  const text = textOf(card);
  assert.match(text, /Geburtstag:\s*28\.12\./);
  assert.match(text, /28\. Dezember/);
  assert.doesNotMatch(text, /2026|Geburtsdatum|wird\s*0|runder Geburtstag/);
  assert.equal(nodes(card).filter((node) => node.type === "Badge").length, 0);
});

test("01.01.2026 wird beim nächsten Vorkommen 2027 nicht zu einem geratenen ersten Geburtstag", async () => {
  const tree = await harness({ profiles: [profile("Januar ohne Geburtsjahr", "2026-01-01")] }).render();
  const text = textOf(birthdayCard(tree, "Januar ohne Geburtsjahr"));
  assert.match(text, /Geburtstag:\s*01\.01\./);
  assert.match(text, /01\. Januar/);
  assert.doesNotMatch(text, /2026|wird\s*1|runder Geburtstag|Geburtsdatum/);
});

test("Zukünftiges Geburtsjahr 2036 zeigt keinen negativen runden Geburtstag", async () => {
  const tree = await harness({ profiles: [profile("Zukünftiges Jahr", "2036-12-28")] }).render();
  const card = birthdayCard(tree, "Zukünftiges Jahr");
  assert.match(textOf(card), /Geburtstag:\s*28\.12\./);
  assert.doesNotMatch(textOf(card), /2036|-10|wird|runder Geburtstag/);
  assert.equal(nodes(card).filter((node) => node.type === "Badge").length, 0);
});

test("Ein echtes Geburtsjahr 1996 bleibt mit Datum, wird 30 und rundem Badge sichtbar", async () => {
  const tree = await harness({ profiles: [profile("Echte Dreißig", "1996-12-28")] }).render();
  const card = birthdayCard(tree, "Echte Dreißig");
  assert.match(textOf(card), /Geburtsdatum:\s*28\.12\.1996/);
  assert.match(textOf(card), /wird 30/);
  const badges = nodes(card).filter((node) => node.type === "Badge");
  assert.equal(badges.length, 1);
  assert.match(textOf(badges[0]), /30\. – runder Geburtstag/);
});

test("Ein echtes Geburtsjahr 1995 zeigt wird 31 ohne runden Badge", async () => {
  const tree = await harness({ profiles: [profile("Echte Einunddreißig", "1995-12-28")] }).render();
  const card = birthdayCard(tree, "Echte Einunddreißig");
  assert.match(textOf(card), /Geburtsdatum:\s*28\.12\.1995/);
  assert.match(textOf(card), /wird 31/);
  assert.equal(nodes(card).filter((node) => node.type === "Badge").length, 0);
});

test("Geburtstag heute bleibt heute und verwendet das aktuelle Geburtstagsjahr", async () => {
  const tree = await harness({ profiles: [profile("Heute", "1996-10-18")] }).render();
  const text = textOf(birthdayCard(tree, "Heute"));
  assert.match(text, /wird 30/);
  assert.match(text, /heute 🎉/);
});

test("Ein gestriger Geburtstag liegt als nächstes im Folgejahr", async () => {
  const tree = await harness({ profiles: [profile("Gestern", "1996-10-17")] }).render();
  const text = textOf(birthdayCard(tree, "Gestern"));
  assert.match(text, /wird 31/);
  assert.match(text, /in 364 Tagen/);
});

test("Ein morgiger Geburtstag bleibt im aktuellen Kalenderjahr", async () => {
  const tree = await harness({ profiles: [profile("Morgen", "1996-10-19")] }).render();
  const text = textOf(birthdayCard(tree, "Morgen"));
  assert.match(text, /wird 30/);
  assert.match(text, /morgen/);
});

test("Der Jahreswechsel liefert für einen Januar-Geburtstag das kommende Alter", async () => {
  const tree = await harness({ profiles: [profile("Jahreswechsel", "1996-01-01")] }).render();
  const text = textOf(birthdayCard(tree, "Jahreswechsel"));
  assert.match(text, /wird 31/);
  assert.match(text, /01\. Januar/);
  assert.match(text, /in 75 Tagen/);
});

test("Berlin bestimmt den Jahreswechsel auch dann, wenn UTC noch im alten Jahr liegt", async () => {
  const tree = await harness({
    profiles: [profile("Berliner Neujahr", "1996-01-01")],
    now: "2026-12-31T23:30:00Z",
  }).render();
  const text = textOf(birthdayCard(tree, "Berliner Neujahr"));
  assert.match(text, /wird 31/);
  assert.match(text, /heute 🎉/);
});

test("Nur aktive Profile mit ausdrücklich erlaubter Geburtstagsanzeige bleiben sichtbar", async () => {
  const tree = await harness({ profiles: [
    profile("Sichtbares Profil", "1996-12-28"),
    profile("Privates Profil", "1996-12-28", { birthday_public: false }),
    profile("Ungeklärte Freigabe", "1996-12-28", { birthday_public: null }),
    profile("Inaktives Profil", "1996-12-28", { is_active: false }),
    profile("Ohne Datum", null),
  ] }).render();
  const text = textOf(section(tree, "Kommende Geburtstage"));
  assert.match(text, /Sichtbares Profil/);
  for (const name of ["Privates Profil", "Ungeklärte Freigabe", "Inaktives Profil", "Ohne Datum"]) {
    assert.ok(!text.includes(name), `${name} darf nicht als Geburtstag erscheinen.`);
  }
});

test("Vorab angelegte Namen bleiben nur unbeansprucht, nicht ausgetreten und mit Freigabe sichtbar", async () => {
  const tree = await harness({ invites: [
    invite("Sichtbarer Name", "1996-12-28"),
    invite("Bereits registriert", "1996-12-28", { claimed: true }),
    invite("Ausgetreten", "1996-12-28", { left_on: "2026-10-17" }),
    invite("Heute ausgetreten", "1996-12-28", { left_on: "2026-10-18" }),
    invite("Späterer Austritt", "1996-12-28", { left_on: "2027-01-01" }),
    invite("Privater Name", "1996-12-28", { birthday_public: false }),
    invite("Name ohne Freigabe", "1996-12-28", { birthday_public: null }),
  ] }).render();
  const text = textOf(section(tree, "Kommende Geburtstage"));
  assert.match(text, /Sichtbarer Name/);
  assert.match(text, /Späterer Austritt/);
  for (const name of ["Bereits registriert", "Ausgetreten", "Heute ausgetreten", "Privater Name", "Name ohne Freigabe"]) {
    assert.ok(!text.includes(name), `${name} darf nicht als Geburtstag erscheinen.`);
  }
});

test("Vereinsjubiläen bleiben von der Alterskorrektur und Geburtstagsfreigabe unberührt", async () => {
  const tree = await harness({ profiles: [profile("Jubiläum", "2026-12-28", {
    birthday_public: false, member_since: "2016-10-19",
  })] }).render();
  assert.ok(!textOf(section(tree, "Kommende Geburtstage")).includes("Jubiläum"));
  const jubilees = textOf(section(tree, "Kommende Vereinsjubiläen"));
  assert.match(jubilees, /Jubiläum/);
  assert.match(jubilees, /10 Jahre dabei/);
  assert.match(jubilees, /morgen/);
});

test("Ohne erfolgreiches requireProfile werden keine Personendaten gelesen", async () => {
  const h = harness({ authError: Error("Nicht angemeldet") });
  await assert.rejects(h.renderUnauthorized, /Nicht angemeldet/);
  assert.equal(h.state.authCalls, 1);
  assert.equal(h.state.adminCalls, 0);
  assert.deepEqual(h.state.reads, []);
  assert.deepEqual(h.state.writes, []);
});
