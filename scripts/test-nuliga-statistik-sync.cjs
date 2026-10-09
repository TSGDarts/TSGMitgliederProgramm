// Ergebnis-/Statistikabgleich mit echtem Anwendungscode und lokaler MockDB.
// Keine Live-Datenbank-, Cron-, Browser- oder Persistenzprüfung.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const baseUrl = "https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/";
const team = { id: "team-2", name: "TSG 08 Roth II", nuliga_table_url: `${baseUrl}groupPage?group=211748&championship=MFr+2026%2F27`, nuliga_url: null };
const link = { berichtUrl: `${baseUrl}groupMeetingReport?group=211748&championship=MFr+2026%2F27&meeting=6112027`, heim: "Finnigan's Harp Nbg. III", gast: team.name, datum: "2026-09-18", ergebnis: "12:6" };
const report = {
  heim: link.heim, gast: link.gast, wirSindHeim: false, ergebnis: "12:6", legsGesamt: "43:27",
  spiele: [{ nr: "1-1", doppel: false, unsere: ["Hempel, Max"], gegner: ["Bär, Tobias"], legs: "3:0", gewonnen: true }],
  bestleistungen: [], uebersprungen: 0,
};
function event(overrides = {}) {
  return { id: "event-1", team_id: team.id, source: "nuliga", source_uid: `nuliga:${team.id}:uid-1`,
    description: `Begegnungs-Nr: 1\nHeim: ${link.heim}\nGast: ${link.gast}`,
    starts_at: "2026-09-18T18:00:00Z", result: null, match_stats: null, ...overrides };
}

function harness(input = {}) {
  const state = {
    rows: structuredClone(input.rows ?? [event()]), writes: [], fetched: [], revalidated: [],
    parsed: [], readError: input.readError, saveError: input.saveError,
  };
  const admin = {
    from(table) {
      assert.equal(table, "events", "Der Statistikimport darf ausschließlich events bearbeiten.");
      const query = {
        filters: [], patch: null,
        select() { return this; },
        eq(column, value) { this.filters.push([column, value]); return this; },
        is(column, value) { return this.eq(column, value); },
        like() { return this; },
        abortSignal() { return this; },
        update(patch) {
          this.patch = patch;
          input.beforeWrite?.(state, patch);
          return this;
        },
        then(resolve, reject) {
          const rows = state.rows.filter((row) => this.filters.every(([key, value]) => row[key] === value));
          return Promise.resolve({ data: structuredClone(rows), error: state.readError ?? null }).then(resolve, reject);
        },
        maybeSingle() {
          let outcome;
          if (state.saveError) outcome = { data: null, error: state.saveError };
          const row = state.rows.find((row) => this.filters.every(([key, value]) => {
            if (key === "match_stats" && value != null) return require("node:util").isDeepStrictEqual(row[key], JSON.parse(value));
            return row[key] === value;
          }));
          if (!outcome) {
            if (!row) outcome = { data: null, error: null };
            else {
              state.writes.push(structuredClone(this.patch));
              Object.assign(row, structuredClone(this.patch));
              outcome = { data: { id: row.id }, error: null };
            }
          }
          return {
            abortSignal() { return this; },
            then(resolve, reject) { return Promise.resolve(outcome).then(resolve, reject); },
          };
        },
      };
      return query;
    },
  };
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(root, file);
    if (cache.has(absolute)) return cache.get(absolute);
    const exports = {};
    cache.set(absolute, exports);
    const js = ts.transpileModule(fs.readFileSync(absolute, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: absolute,
    }).outputText;
    const localRequire = (id) => {
      if (input.modules && Object.hasOwn(input.modules, id)) return input.modules[id];
      if (id === "server-only") return {};
      if (id === "next/cache") return { revalidatePath: (...args) => state.revalidated.push(args) };
      if (id === "@/lib/nuliga-berichte" && !input.realParser) return {
        nuligaSpielplanUrl: (raw) => raw ? team.nuliga_table_url : null,
        parseNuligaErgebnisse: () => input.ergebnisse ?? [link],
        parseNuligaSpielberichtHtml: (_html, expected) => {
          state.parsed.push(structuredClone(expected));
          return input.invalidReport ? { ok: false, fehler: "Unvollständig" } : { ok: true, bericht: input.report ?? report };
        },
      };
      if (id.startsWith("@/")) return load(`src/${id.slice(2)}.ts`);
      if (id.startsWith(".")) return load(path.relative(root, path.resolve(path.dirname(absolute), `${id}.ts`)));
      return require(id);
    };
    const fetch = async (url, options) => {
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "manual");
      state.fetched.push(url);
      if (input.fetch) return input.fetch(url, options);
      return new Response("<table>Fixture</table>");
    };
    vm.runInNewContext(js, {
      exports, require: localRequire, URL, Response, AbortSignal, Intl, Date,
      fetch, setTimeout, clearTimeout, console,
    }, { filename: absolute });
    return exports;
  }
  return { state, admin, load, run: (config = team, options) => load("src/lib/nuliga-statistik-sync.ts").syncNuligaSpielberichte(admin, config, options) };
}

(async () => {
  let checks = 0;
  async function check(name, test) { await test(); checks++; console.log(`OK ${name}`); }
  await check("Neuer Bericht erhält 3K-Daten und Quelle; zweiter Lauf schreibt nichts", async () => {
    const dreik = { gesamtAvg: "59.9", spiele: [] };
    const h = harness({ rows: [event({ match_stats: { quelle: "3k", dreik } })] });
    const first = await h.run();
    assert.equal(first.neu, 1);
    assert.equal(first.ergebnisseNeu, 1);
    assert.deepEqual(h.state.rows[0].match_stats.dreik, dreik);
    assert.equal(h.state.rows[0].match_stats.quelle, "3k");
    assert.deepEqual(h.state.rows[0].match_stats.nuliga, report);
    assert.equal(h.state.rows[0].result, "12:6");
    assert.deepEqual(h.state.parsed[0], link);
    const second = await h.run();
    assert.equal(second.unveraendert, 1);
    assert.equal(second.ergebnisseUnveraendert, 1);
    assert.equal(h.state.writes.length, 2);
    assert.deepEqual(h.state.writes[0], { result: "12:6" });
    assert.ok(!Object.hasOwn(h.state.writes[1], "result"));
    assert.ok(h.state.revalidated.some(([url]) => url === "/mitglieder/statistiken"));
  });
  await check("Korrektur und alte direkt gespeicherte Berichte", async () => {
    const h = harness({ rows: [event({ result: "11:7", match_stats: { ...report, ergebnis: "11:7" } })] });
    const result = await h.run();
    assert.equal(result.aktualisiert, 1);
    assert.equal(result.ergebnisseAktualisiert, 1);
    assert.equal(h.state.rows[0].match_stats.nuliga.ergebnis, "12:6");
  });
  await check("Ergebnis ohne Spielbericht wird übernommen; zweiter Lauf bleibt unverändert", async () => {
    const h = harness({ ergebnisse: [{ ...link, berichtUrl: null }] });
    const first = await h.run();
    assert.equal(first.ergebnisseNeu, 1);
    assert.equal(first.neu, 0);
    assert.equal(first.geprueft, 0);
    assert.equal(h.state.rows[0].result, "12:6");
    assert.equal(h.state.rows[0].match_stats, null);
    assert.deepEqual(h.state.writes, [{ result: "12:6" }]);
    assert.equal(h.state.fetched.length, 1);
    const second = await h.run();
    assert.equal(second.ergebnisseUnveraendert, 1);
    assert.equal(second.ergebnisseNeu, 0);
    assert.equal(h.state.writes.length, 1);
    assert.ok(h.state.revalidated.some(([url]) => url === "/mitglieder/ergebnisse"));
    assert.ok(!h.state.revalidated.some(([url]) => url === "/mitglieder/statistiken"));
  });
  await check("Ergebniskorrektur ohne Bericht erhält vorhandene 3K- und Statistikdaten", async () => {
    const previous = { quelle: "3k", dreik: { gesamtAvg: "62.0", spiele: [] }, nuliga: { ...report, ergebnis: "11:7" } };
    const h = harness({ ergebnisse: [{ ...link, berichtUrl: null }], rows: [event({ result: "11:7", match_stats: previous })] });
    const result = await h.run();
    assert.equal(result.ergebnisseAktualisiert, 1);
    assert.equal(result.aktualisiert, 0);
    assert.equal(h.state.rows[0].result, "12:6");
    assert.deepEqual(h.state.rows[0].match_stats, previous);
    assert.deepEqual(h.state.writes, [{ result: "12:6" }]);
  });
  await check("JSONB-Schlüsselreihenfolge erzeugt keinen neuen Import", async () => {
    const reordered = Object.fromEntries(Object.entries(report).reverse());
    const h = harness({ rows: [event({ result: report.ergebnis, match_stats: { nuliga: reordered } })] });
    assert.equal((await h.run()).unveraendert, 1);
    assert.equal(h.state.writes.length, 0);
  });
  await check("Paralleler 3K-Import bleibt erhalten, Ergebnis wird unabhängig gespeichert", async () => {
    const h = harness({ beforeWrite: (state) => { state.rows[0].match_stats = { dreik: { gesamtAvg: "62.0" } }; } });
    const result = await h.run();
    assert.equal(result.konflikte, 1);
    assert.equal(result.ergebnisseNeu, 1);
    assert.equal(result.neu, 0);
    assert.equal(h.state.rows[0].result, "12:6");
    assert.equal(h.state.rows[0].match_stats.dreik.gesamtAvg, "62.0");
    assert.deepEqual(h.state.writes, [{ result: "12:6" }]);
  });
  await check("Parallele Terminverlegung blockiert veraltete Zuordnung", async () => {
    const h = harness({ beforeWrite: (state) => { state.rows[0].starts_at = "2026-09-19T18:00:00Z"; } });
    assert.equal((await h.run()).konflikte, 1);
    assert.equal(h.state.writes.length, 0);
  });
  await check("Parallele Ergebniskorrektur hat Vorrang und blockiert einen veralteten Bericht", async () => {
    const h = harness({ beforeWrite: (state) => { state.rows[0].result = "9:9"; } });
    const result = await h.run();
    assert.equal(result.konflikte, 1);
    assert.equal(result.ergebnisseNeu, 0);
    assert.equal(result.neu, 0);
    assert.equal(h.state.rows[0].result, "9:9");
    assert.equal(h.state.rows[0].match_stats, null);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.fetched.length, 1);
  });
  await check("Statistik-Schreibfehler lässt das zuvor gespeicherte Ergebnis erhalten", async () => {
    const h = harness({ beforeWrite: (state, patch) => {
      if (Object.hasOwn(patch, "match_stats")) state.saveError = { message: "unavailable" };
    } });
    const result = await h.run();
    assert.equal(result.ergebnisseNeu, 1);
    assert.equal(result.neu, 0);
    assert.match(result.fehler[0], /Spielbericht/);
    assert.equal(h.state.rows[0].result, "12:6");
    assert.equal(h.state.rows[0].match_stats, null);
    assert.deepEqual(h.state.writes, [{ result: "12:6" }]);
  });
  await check("Unvollständiger Bericht lässt das veröffentlichte Ergebnis gespeichert", async () => {
    const h = harness({ invalidReport: true });
    const result = await h.run();
    assert.equal(result.fehler.length, 1);
    assert.equal(result.ergebnisseNeu, 1);
    assert.equal(result.neu, 0);
    assert.equal(h.state.rows[0].result, "12:6");
    assert.equal(h.state.rows[0].match_stats, null);
    assert.deepEqual(h.state.writes, [{ result: "12:6" }]);
  });
  await check("Abweichender Spielbericht überschreibt weder Endergebnis noch Statistik", async () => {
    const previous = { quelle: "3k", dreik: { gesamtAvg: "62.0" } };
    const h = harness({ rows: [event({ match_stats: previous })], report: { ...report, ergebnis: "11:7" } });
    const result = await h.run();
    assert.equal(result.ergebnisseNeu, 1);
    assert.equal(result.neu, 0);
    assert.match(result.fehler[0], /Endergebnis/);
    assert.equal(h.state.rows[0].result, "12:6");
    assert.deepEqual(h.state.rows[0].match_stats, previous);
    assert.deepEqual(h.state.writes, [{ result: "12:6" }]);
  });
  await check("Positives Ergebnis für eine zukünftige Begegnung wird nicht vorab übernommen", async () => {
    const h = harness({ ergebnisse: [{ ...link, datum: "2099-09-18" }], rows: [event({ starts_at: "2099-09-18T18:00:00Z" })] });
    const result = await h.run();
    assert.equal(result.ergebnisseNeu, 0);
    assert.equal(result.geprueft, 0);
    assert.equal(h.state.rows[0].result, null);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.fetched.length, 1);
  });
  await check("Echter Ergebnisparser lässt leere und 0:0-Zeilen ohne Ergebnisimport", async () => {
    const schedule = `<table><tr><th>Datum</th><th>Heimmannschaft</th><th>Gastmannschaft</th><th>Spiele</th></tr>` +
      ["", "0:0"].map((score, index) => `<tr><td>${18 + index}.09.2026</td><td>${link.heim}</td><td>${link.gast}</td><td>${score}</td></tr>`).join("") + `</table>`;
    const h = harness({ realParser: true, fetch: () => new Response(schedule) });
    const result = await h.run();
    assert.equal(result.ergebnisseNeu, 0);
    assert.equal(result.geprueft, 0);
    assert.equal(result.fehler.length, 0);
    assert.equal(h.state.writes.length, 0);
    assert.equal(h.state.rows[0].result, null);
  });
  await check("Mehrdeutige oder falsche Begegnung wird nicht beschrieben", async () => {
    for (const rows of [[event(), event({ id: "event-2" })], [event({ description: `Heim: ${link.heim}\nGast: TSG 08 Roth III` })]]) {
      const h = harness({ rows });
      assert.equal((await h.run()).nichtZugeordnet, 1);
      assert.equal(h.state.writes.length, 0);
      assert.equal(h.state.fetched.length, 1);
    }
  });
  await check("Zuordnung verwendet den lokalen Kalendertag in Berlin", async () => {
    const h = harness({ rows: [event({ starts_at: "2026-09-17T22:30:00Z" })] });
    assert.equal((await h.run()).neu, 1);
  });
  await check("Erste Mannschaft mit explizitem I passt zu NuLiga", async () => {
    const firstLink = { ...link, gast: "TSG 08 Roth" };
    const h = harness({ ergebnisse: [firstLink], rows: [event({ description: `Heim: ${link.heim}\nGast: TSG 08 Roth I` })] });
    assert.equal((await h.run({ ...team, name: "TSG 08 Roth I" })).neu, 1);
  });
  await check("Externe Weiterleitung und externe Berichtadresse werden abgewiesen", async () => {
    const redirected = harness({ fetch: () => new Response(null, { status: 302, headers: { location: "https://example.org/private" } }) });
    assert.equal((await redirected.run()).fehler.length, 1);
    assert.equal(redirected.state.fetched.length, 1);
    const external = harness({ ergebnisse: [{ ...link, berichtUrl: "https://example.org/report" }] });
    const result = await external.run();
    assert.equal(result.fehler.length, 1);
    assert.equal(result.ergebnisseNeu, 1);
    assert.deepEqual(external.state.writes, [{ result: "12:6" }]);
    assert.equal(external.state.fetched.length, 1);
  });
  await check("Fehlende Konfiguration und Datenbankfehler sind sichtbar", async () => {
    const missing = harness();
    assert.equal((await missing.run({ ...team, nuliga_table_url: null })).nichtKonfiguriert, true);
    assert.equal(missing.state.fetched.length, 0);
    const failedRead = harness({ readError: { message: "unavailable" } });
    assert.equal((await failedRead.run()).fehler.length, 1);
    const failedSave = harness({ saveError: { message: "unavailable" } });
    assert.equal((await failedSave.run()).fehler.length, 1);
    assert.equal(failedSave.state.writes.length, 0);
  });
  await check("Abgelaufenes Zeitbudget schreibt nichts", async () => {
    const h = harness();
    assert.ok((await h.run(team, { deadline: Date.now() - 1 })).fehler.length > 0);
    assert.equal(h.state.writes.length, 0);
  });
  await check("Ein defekter Bericht verhindert nicht spätere Imports", async () => {
    const later = { ...link, datum: "2026-09-25", berichtUrl: link.berichtUrl.replace("6112027", "6112028") };
    const h = harness({
      ergebnisse: [link, later], rows: [event(), event({ id: "event-2", starts_at: "2026-09-25T18:00:00Z" })],
      fetch: (url) => url === link.berichtUrl ? new Response("unavailable", { status: 404 }) : new Response("<table>Fixture</table>"),
    });
    const result = await h.run();
    assert.equal(result.neu, 1);
    assert.equal(result.ergebnisseNeu, 2);
    assert.equal(result.fehler.length, 1);
    assert.equal(h.state.rows[0].result, "12:6");
    assert.equal(h.state.rows[0].match_stats, null);
    assert.equal(h.state.rows[1].result, "12:6");
  });
  await check("Täglicher und manueller NuLiga-Abgleich prüfen Berichte trotz unverändertem Kalender", async () => {
    const description = `Begegnungs-Nr: 1\nHeim: ${link.heim}\nGast: ${link.gast}`;
    const title = `${link.heim} - ${link.gast}`;
    const ical = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:uid-1", `SUMMARY:${title}`,
      `DESCRIPTION:${description.replace(/\n/g, "\\n")}`, "DTSTART:20260918T180000Z", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const configured = { ...team, league: "2. Bezirksliga A", slug: "tsg-ii", nuliga_ical_url: `${baseUrl}calendar.ics` };
    let configuredTeams = [configured];
    let feed = ical;
    const calls = [];
    const statistic = { ergebnisseNeu: 2, ergebnisseAktualisiert: 1, ergebnisseUnveraendert: 3, geprueft: 1, neu: 1, aktualisiert: 0, unveraendert: 0, nichtZugeordnet: 0, konflikte: 0, nichtKonfiguriert: false, fehler: [] };
    const modules = {
      "@/lib/benachrichtigung": { benachrichtige: async () => { throw new Error("Keine Verlegung erwartet"); } },
      "@/lib/format": {},
      "@/lib/nuliga-opponent-sync": {
        syncImportedOpponents: async () => ({ links: [{ opponent_id: null, opponent_team_no: null, home_away: "" }], opponentsFound: 0, opponentsCreated: 0, addressesAdded: 0, unrecognized: 0, retryableErrors: false }),
      },
      "@/lib/nuliga-statistik-sync": {
        syncNuligaSpielberichte: async (_admin, selected, options) => { calls.push({ selected, options }); return statistic; },
      },
    };
    const calendarEvent = { title, location: "", ends_at: null, opponent_id: null, opponent_team_no: null, home_away: "" };
    const h = harness({ modules, fetch: () => new Response(feed), rows: [event(calendarEvent)] });
    const admin = {
      from(table) {
        if (table !== "teams") return h.admin.from(table);
        return {
          select() { return this; }, eq() { return this; }, not() { return this; }, neq() { return this; }, order() { return this; },
          maybeSingle: async () => ({ data: configured, error: null }),
          then(resolve, reject) { return Promise.resolve({ data: configuredTeams, error: null }).then(resolve, reject); },
        };
      },
    };
    modules["@/lib/supabase/admin"] = { createAdminSupabase: () => admin };
    const sync = h.load("src/lib/nuliga-sync.ts");
    const daily = await sync.syncAllNuligaTeams();
    assert.equal(daily.ok, true);
    assert.equal(daily.unveraendert, 1);
    assert.equal(daily.berichteNeu, 1);
    assert.equal(daily.berichteGeprueft, 1);
    assert.equal(daily.ergebnisseNeu, 2);
    assert.equal(daily.ergebnisseAktualisiert, 1);
    const manual = await sync.syncNuligaTeam({ teamId: team.id, icalText: ical, notifyMoves: false });
    assert.equal(manual.ok, true);
    assert.equal(manual.statistik.neu, 1);
    assert.equal(manual.statistik.ergebnisseNeu, 2);
    assert.equal(manual.statistik.ergebnisseAktualisiert, 1);
    assert.equal(manual.statistik.ergebnisseUnveraendert, 3);
    assert.match(sync.formatNuligaSyncMessage(manual), /Ergebnisse: 2 neu, 1 korrigiert, 3 unverändert/);
    assert.match(sync.formatNuligaSyncMessage(manual), /Liga-Statistik: 1 Spielberichte neu/);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].selected.nuliga_table_url, team.nuliga_table_url);
    assert.ok(calls[0].options.deadline > Date.now());
    await check("Defekter Kalender verhindert weder Ergebnisabgleich noch Ergebnis-Meldung", async () => {
      statistic.neu = 0;
      statistic.geprueft = 0;
      h.state.revalidated.length = 0;
      const broken = await sync.syncNuligaTeam({ teamId: team.id, icalText: "broken", notifyMoves: false });
      assert.equal(broken.ok, false);
      assert.equal(calls.length, 3);
      assert.equal(broken.statistik.ergebnisseNeu, 2);
      assert.equal(broken.statistik.ergebnisseAktualisiert, 1);
      assert.equal(broken.statistik.neu, 0);
      assert.ok(broken.fehler.length > 0);
      const message = sync.formatNuligaSyncMessage(broken);
      assert.match(message, /Ergebnisse: 2 neu, 1 korrigiert, 3 unverändert/);
      assert.ok(message.includes(broken.fehler[0]));
      assert.ok(h.state.revalidated.some(([url]) => url === "/mitglieder"));
    });
    await check("Täglicher Abgleich zählt Ergebnisse auch bei defektem Kalender weiter", async () => {
      feed = "broken";
      const before = calls.length;
      const broken = await sync.syncAllNuligaTeams();
      assert.equal(broken.ok, false);
      assert.equal(calls.length, before + 1);
      assert.equal(broken.ergebnisseNeu, 2);
      assert.equal(broken.ergebnisseAktualisiert, 1);
      assert.equal(broken.berichteNeu, 0);
      assert.ok(broken.ergebnisse[0].fehler.length > 0);
      feed = ical;
    });
    await check("Sechs Mannschaften erhalten eigene Zeitbudgets und werden alle abgeglichen", async () => {
      configuredTeams = Array.from({ length: 6 }, (_, index) => ({ ...configured, id: `fair-team-${index + 1}`, slug: `fair-${index + 1}` }));
      h.state.rows.push(...configuredTeams.map((selected, index) => event({ ...calendarEvent, id: `fair-event-${index + 1}`, team_id: selected.id, source_uid: `nuliga:${selected.id}:uid-1` })));
      const before = calls.length;
      const started = Date.now();
      const all = await sync.syncAllNuligaTeams();
      assert.equal(all.ok, true);
      const fairCalls = calls.slice(before);
      assert.equal(fairCalls.length, 6);
      assert.deepEqual(fairCalls.map(({ selected }) => selected.id), configuredTeams.map(({ id }) => id));
      assert.ok(fairCalls[0].options.deadline > started);
      assert.ok(fairCalls[0].options.deadline - started <= 45_000, "Die erste Mannschaft darf nicht das gesamte 240-Sekunden-Budget verbrauchen.");
      assert.ok(fairCalls.every(({ options }) => options.deadline <= started + 241_000));
      assert.equal(all.ergebnisseNeu, 12);
      assert.equal(all.ergebnisseAktualisiert, 6);
    });
  });
  const realSchedule = path.join(root, "tmp/nuliga-statistik-schedule.html");
  const realReport = path.join(root, "tmp/nuliga-statistik-report.html");
  if (fs.existsSync(realSchedule) && fs.existsSync(realReport)) {
    await check("Echter öffentlicher HTML-Spielplan bis zu gespeicherter 18-Spiele-Statistik", async () => {
      const h = harness({ realParser: true, fetch: (url) => new Response(fs.readFileSync(url.includes("groupMeetingReport") ? realReport : realSchedule, "utf8")) });
      const result = await h.run();
      assert.equal(result.neu, 1);
      assert.equal(result.fehler.length, 0);
      assert.equal(h.state.rows[0].match_stats.nuliga.spiele.length, 18);
      assert.equal(h.state.rows[0].match_stats.nuliga.ergebnis, "12:6");
      assert.equal(h.state.rows[0].match_stats.nuliga.legsGesamt, "43:27");
    });
  }
  console.log(`${checks} gezielte Statistik-Abgleich-Prüfungen bestanden. Keine echten Datenbankzugriffe.`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
