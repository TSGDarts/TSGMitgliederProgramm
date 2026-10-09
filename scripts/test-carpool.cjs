// Gezielte Regression: echte Serveraction, Seite und Componenthandler,
// echte Supabase-HTTP-Requestbildung; DB/React-Laufzeit sind lokale Doubles.
// Kein PostgreSQL/PostgREST-, Browser-, Login- oder Live-Persistenznachweis.
// Aufruf: node scripts/test-carpool.cjs
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const root = path.resolve(__dirname, "..");
const eventId = "00000000-0000-0000-0000-000000000001";
const profileId = "00000000-0000-0000-0000-000000000002";
const otherId = "00000000-0000-0000-0000-000000000003";
const profile = { id: profileId, role: "player", is_active: true, full_name: "Testmitglied" };
const jsx = (type, props) => ({ type, props: props || {} });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: "Fragment" };
const clean = (value) => JSON.parse(JSON.stringify(value));

function load(file, modules) {
  const absolute = path.join(root, file);
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: absolute,
  }).outputText;
  vm.runInNewContext(js, {
    exports, require: (id) => modules[id] ?? (id === "react/jsx-runtime" ? jsxRuntime : {}),
    console, Date, URLSearchParams,
  }, { filename: absolute });
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
  if (typeof tree !== "object") return String(tree);
  return textOf(tree.props?.children);
}

// Beziehungen aus den tatsächlich vorhandenen Migrationen, nicht aus einem
// erwarteten Select-String. Der lokale HTTP-Double bildet nur diesen FK-Fall ab.
const foreignKeys = ["37_spieltag.sql", "60_fahrgemeinschaft_zuordnung.sql"].flatMap((file) => {
  const sql = fs.readFileSync(path.join(root, "supabase", file), "utf8");
  return [...sql.matchAll(/(\w+)\s+uuid\s+(?:not null\s+)?references\s+(?:public\.)?profiles\s*\(id\)/g)].map((match) => match[1]);
});
assert.equal(foreignKeys.length, 2, "Fixture benötigt beide tatsächlichen Beziehungen zu profiles.");

function harness(input = {}) {
  const state = { rows: clean(input.rows ?? []), requests: [], revalidated: [], writeError: null, readError: null, deleteError: null };
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const client = createClient("https://carpool-fixture.invalid", "fixture-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (rawUrl, options) => {
      const url = new URL(rawUrl);
      assert.equal(url.origin, "https://carpool-fixture.invalid", "Keine externen Requests zulassen.");
      const method = options.method ?? "GET";
      const table = url.pathname.split("/").at(-1);
      state.requests.push({ method, table, url: url.toString() });
      if (table === "event_lineups") return response(null);
      assert.equal(table, "event_carpool", "Nur die unmittelbar benötigte Terminabfrage ist erlaubt.");
      const matches = (row) => ["event_id", "profile_id"].every((field) => !url.searchParams.has(field) || url.searchParams.get(field) === `eq.${row[field]}`);
      if (method === "POST") {
        if (state.writeError) return response(state.writeError, 403);
        const row = JSON.parse(options.body);
        assert.equal(row.profile_id, profile.id, "Serveraction muss das angemeldete Profil verwenden.");
        assert.match(new Headers(options.headers).get("Prefer"), /resolution=merge-duplicates/);
        const old = state.rows.find((candidate) => candidate.event_id === row.event_id && candidate.profile_id === row.profile_id);
        if (old) Object.assign(old, row); else state.rows.push(row);
        return response(null, 201);
      }
      if (method === "DELETE") {
        if (state.deleteError) return response(state.deleteError, 403);
        assert.equal(url.searchParams.get("profile_id"), `eq.${profile.id}`);
        state.rows = state.rows.filter((row) => !matches(row));
        return response(null);
      }
      assert.equal(method, "GET");
      if (state.readError) return response(state.readError, 500);
      const embedded = /profiles(?:!([^()]+))?\(full_name\)/.exec(url.searchParams.get("select") ?? "");
      if (embedded && !embedded[1] && foreignKeys.length > 1) {
        return response({ code: "PGRST201", message: "Could not embed because more than one relationship was found", details: foreignKeys }, 300);
      }
      if (embedded) {
        const column = foreignKeys.find((key) => embedded[1] === key || embedded[1] === `event_carpool_${key}_fkey`);
        assert.ok(column, "Der Relation-Hinweis muss zu einem vorhandenen Fremdschlüssel passen.");
        return response(state.rows.filter(matches).map((row) => ({ ...row, profiles: row[column] === profileId ? { full_name: profile.full_name } : { full_name: "Anderer Fahrer" } })));
      }
      return response(state.rows.filter(matches));
    } },
  });
  const baseModules = {
    "@/lib/auth": { requireProfile: async () => profile },
    "@/lib/supabase/server": { createClient: async () => client },
    "next/cache": { revalidatePath: (value) => state.revalidated.push(value) },
  };
  const action = load("src/app/mitglieder/termine/spieltag-actions.ts", baseModules).setCarpool;
  const pageModules = {
    ...baseModules,
    "next/navigation": { notFound: () => { throw Error("notFound"); } },
    "@/lib/member-queries": {
      getEvent: async () => ({ id: eventId, title: "Auswärtsspiel", team_id: "team-1", type: "match", home_away: "auswaerts", location: "Nürnberg", starts_at: "2026-10-10T18:00:00Z" }),
      getEventParticipants: async () => [], getTeamsMap: async () => new Map([["team-1", { name: "TSG I" }]]), getManageableTeamIds: async () => new Set(),
    },
    "@/lib/settings": { getSpielModi: async () => null },
    "@/lib/types": { isCompSpiegel: () => false, EVENT_TYPE_LABELS: { match: "Spiel" }, RSVP_LABELS: {} },
    "@/lib/format": Object.fromEntries(["formatDate", "formatDateTime", "formatTime", "formatUntil"].map((key) => [key, () => "18:00"])),
    "@/lib/lineup": { lineupModeKeyForEvent: () => "", lineupModeOptionsForEvent: () => [] },
    "@/components/CarpoolSection": { CarpoolSection: "CarpoolSection" },
  };
  const page = load("src/app/mitglieder/termine/[id]/page.tsx", pageModules).default;
  return { state, client, action, renderPage: () => page({ params: Promise.resolve({ id: eventId }), searchParams: Promise.resolve({}) }) };
}

function componentHarness(action, props = {}) {
  const state = [], jobs = [];
  let cursor = 0, pending = false, refreshes = 0;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }]; },
    useTransition() { return [pending, (work) => { pending = true; jobs.push(Promise.resolve(work()).finally(() => { pending = false; })); }]; },
  };
  const Component = load("src/components/CarpoolSection.tsx", {
    react, "next/navigation": { useRouter: () => ({ refresh: () => { refreshes++; } }) },
    "@/app/mitglieder/termine/spieltag-actions": { setCarpool: action },
  }).CarpoolSection;
  const initial = { eventId, meineRolle: null, meineSeats: null, meinOrt: "", meinZiel: "", meineAbfahrt: "", meinFahrerId: null, zielVorgabe: "Nürnberg", fahrer: [], mitfahrer: [], ...props };
  const render = () => { cursor = 0; return Component(initial); };
  const button = (label) => nodes(render()).find((node) => node.type === "button" && textOf(node).includes(label));
  return { render, button, click: (label) => { assert.ok(button(label)); button(label).props.onClick(); }, flush: async () => { await Promise.all(jobs.splice(0)); return render(); }, refreshes: () => refreshes };
}

(async () => {
  let checks = 0;
  async function check(label, run) { await run(); checks++; console.log(`OK ${label}`); }
  await check("Migrationen reproduzieren mehrdeutigen ursprünglichen Profil-Join", async () => {
    const h = harness();
    const result = await h.client.from("event_carpool").select("profile_id, profiles(full_name)").eq("event_id", eventId);
    assert.equal(result.error?.code, "PGRST201");
  });
  await check("Normales Mitglied trägt Fahrer ein; frische Terminseite zeigt Rolle und seinen Namen", async () => {
    const h = harness();
    assert.equal((await h.action(eventId, "fahrer", { seats: 4, ort: " Roth " })).ok, true);
    const tree = await h.renderPage();
    const carpool = nodes(tree).find((node) => node.type === "CarpoolSection");
    assert.ok(carpool);
    assert.equal(carpool.props.meineRolle, "fahrer");
    assert.equal(carpool.props.meineSeats, 4);
    assert.equal(carpool.props.meinOrt, "Roth");
    assert.equal(carpool.props.fahrer[0].name, profile.full_name);
    assert.deepEqual(h.state.revalidated, [`/mitglieder/termine/${eventId}`]);
  });
  await check("Platzänderung aktualisiert denselben Eintrag; Rollenwechsel speichert Fahrerzuordnung", async () => {
    const h = harness();
    await h.action(eventId, "fahrer", { seats: 3 });
    await h.action(eventId, "fahrer", { seats: 8 });
    assert.equal(h.state.rows.length, 1);
    assert.equal(h.state.rows[0].seats, 8);
    await h.action(eventId, "mitfahrer", { fahrerId: otherId });
    const carpool = nodes(await h.renderPage()).find((node) => node.type === "CarpoolSection");
    assert.equal(carpool.props.meineRolle, "mitfahrer");
    assert.equal(carpool.props.meinFahrerId, otherId);
    assert.equal(h.state.rows[0].seats, null);
  });
  await check("Austragen entfernt nur den eigenen Eintrag und ist nach erneutem Laden sichtbar", async () => {
    const h = harness({ rows: [{ event_id: eventId, profile_id: otherId, role: "fahrer", seats: 2 }] });
    await h.action(eventId, "fahrer");
    assert.equal((await h.action(eventId, null)).ok, true);
    assert.equal(h.state.rows.length, 1);
    assert.equal(h.state.rows[0].profile_id, otherId);
    const carpool = nodes(await h.renderPage()).find((node) => node.type === "CarpoolSection");
    assert.equal(carpool.props.meineRolle, null);
  });
  await check("Schreibfehler meldet keinen Erfolg und invalidiert keine Seite", async () => {
    const h = harness();
    h.state.writeError = { code: "42501", message: "permission denied" };
    assert.equal((await h.action(eventId, "fahrer")).ok, false);
    assert.equal(h.state.rows.length, 0);
    assert.equal(h.state.revalidated.length, 0);
  });
  await check("Austragenfehler erhält vorhandenen Eintrag und meldet keinen Erfolg", async () => {
    const h = harness();
    await h.action(eventId, "fahrer");
    h.state.revalidated.length = 0;
    h.state.deleteError = { code: "42501", message: "permission denied" };
    assert.equal((await h.action(eventId, null)).ok, false);
    assert.equal(h.state.rows[0].role, "fahrer");
    assert.equal(h.state.revalidated.length, 0);
  });
  await check("Ladefehler wird als Fehlermeldung statt als leere Fahrgemeinschaft angezeigt", async () => {
    const h = harness();
    h.state.readError = { code: "XX000", message: "connection failed" };
    const tree = await h.renderPage();
    assert.ok(nodes(tree).some((node) => node.props?.role === "alert" && /Fahrgemeinschaft/.test(textOf(node))));
    assert.ok(!nodes(tree).some((node) => node.type === "CarpoolSection"));
  });
  await check("Fahrer wird während Speichern erst nach erfolgreicher Antwort ausgewählt", async () => {
    let resolve;
    const c = componentHarness(() => new Promise((done) => { resolve = done; }));
    c.click("Ich fahre");
    assert.ok(!c.button("Ich fahre").props.className.includes("border-ok"));
    assert.match(textOf(c.render()), /Speichert/);
    assert.ok(!textOf(c.render()).includes("✓ gespeichert"));
    resolve({ ok: true });
    await c.flush();
    assert.match(c.button("Ich fahre").props.className, /border-ok/);
    assert.match(textOf(c.render()), /✓ gespeichert/);
    assert.equal(c.refreshes(), 1);
  });
  await check("Fehlgeschlagener Fahrereintrag zeigt Fehler ohne Auswahl, Erfolg oder Refresh", async () => {
    const c = componentHarness(async () => ({ ok: false, message: "Speichern fehlgeschlagen" }));
    c.click("Ich fahre");
    const tree = await c.flush();
    assert.ok(!c.button("Ich fahre").props.className.includes("border-ok"));
    assert.match(textOf(tree), /Speichern fehlgeschlagen/);
    assert.ok(!textOf(tree).includes("✓ gespeichert"));
    assert.equal(c.refreshes(), 0);
  });
  await check("Unerwarteter Actionfehler bleibt sichtbar und erhält bisherige Fahrerrolle", async () => {
    const c = componentHarness(async () => { throw Error("offline"); }, { meineRolle: "fahrer", meineSeats: 3 });
    c.click("Mitfahrgelegenheit");
    const tree = await c.flush();
    assert.match(textOf(tree), /konnte nicht gespeichert werden/);
    assert.match(c.button("Ich fahre").props.className, /border-ok/);
    assert.equal(c.refreshes(), 0);
  });
  await check("Fehlgeschlagenes Austragen erhält Auswahl und vorhandene Plätze", async () => {
    const c = componentHarness(async () => ({ ok: false, message: "Austragen fehlgeschlagen" }), { meineRolle: "fahrer", meineSeats: 4 });
    c.click("Austragen");
    await c.flush();
    assert.match(c.button("Ich fahre").props.className, /border-ok/);
    assert.equal(nodes(c.render()).find((node) => node.type === "select").props.value, 4);
    assert.equal(c.refreshes(), 0);
  });
  await check("Componenthandler speichert und frische Seite stellt Fahrerzustand wieder her", async () => {
    const h = harness();
    const c = componentHarness(h.action);
    c.click("Ich fahre");
    await c.flush();
    const saved = nodes(await h.renderPage()).find((node) => node.type === "CarpoolSection").props;
    const reloaded = componentHarness(h.action, saved);
    assert.match(reloaded.button("Ich fahre").props.className, /border-ok/);
    assert.equal(reloaded.refreshes(), 0);
    assert.ok(!textOf(reloaded.render()).includes("✓ gespeichert"));
  });
  console.log(`${checks} gezielte Fahrgemeinschaft-Prüfungen bestanden (lokale Doubles, keine Live-DB).`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
