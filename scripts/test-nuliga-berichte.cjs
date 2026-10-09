// Nur die drei reinen nuLiga-Parser-Module; keine Datenbank und kein Netzwerk.
// Aufruf: node --test scripts/test-nuliga-berichte.cjs
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
const { nuligaSpielplanUrl, parseNuligaErgebnisse, parseNuligaBerichtLinks, parseNuligaSpielberichtHtml } =
  loadTs(path.join(root, "src/lib/nuliga-berichte.ts"));
const base = "https://bdv-dart.liga.nu/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupPage?group=211748&championship=MFr+2026%2F27";
const endpoint = "/cgi-bin/WebObjects/nuLigaDARTDE.woa/wa/groupMeetingReport?meeting=6112027&amp;group=211748&amp;championship=MFr+2026%2F27";
const expected = { heim: "TSG 08 Roth II", gast: "Example Darts III", datum: "2026-09-18" };
const scheduleRow = ({ date = "18.09.2026", home = expected.heim, away = expected.gast, score = "12:6", href = endpoint } = {}) =>
  `<tr><td>Fr</td><td>${date}</td><td>20:00</td><td>1234</td><td>${home}</td><td>${away}</td><td>${href === null ? score : `<a href="${href}">${score}</a>`}</td></tr>`;
const schedule = (...entries) => `<table><tr><th>Tag</th><th>Datum</th><th>Zeit</th><th>Place</th><th>Heimmannschaft</th><th>Gastmannschaft</th><th>Spiele</th></tr>${entries.join("")}</table>`;
const matchRow = (nr, win) => `<tr><td>${nr}</td><td>Schneck, Ferdinand</td><td>B&auml;r, Tobias</td><td>${win ? "3:0" : "1:3"}</td><td>${win ? "1:0" : "0:1"}</td><td>${win ? "1:0" : "0:1"}</td></tr>`;
const doubleRow = (win) => `<tr><td>D1-D1</td><td>Schneck, Ferdinand<br/>Jauch, Marco</td><td>B&auml;r, Tobias<br/>Choroba, Maximilian</td><td>${win ? "3:0" : "1:3"}</td><td>${win ? "1:0" : "0:1"}</td><td>${win ? "1:0" : "0:1"}</td></tr>`;
const report = `<h1>Mittelfranken 2026/27<br/>2. Bezirksliga A<br/>${expected.heim} - ${expected.gast},&nbsp;18.09.2026, 20:00 Uhr</h1>
<h2>Match Report</h2><table><tr><th>&nbsp;</th><th>${expected.heim}</th><th>${expected.gast}</th><th>1. Satz</th><th>S&auml;tze</th><th>Spiele</th></tr>
${Array.from({ length: 17 }, (_, i) => matchRow(`${i + 1}-1`, i < 12)).join("")}<tr><td colspan="11">&nbsp;</td></tr>${doubleRow(false)}
<tr><td colspan="3">&nbsp;</td><td>Legs:&nbsp;42:18</td><td>12:6</td><td>12:6</td></tr></table>
<h2>Bestleistungen 180er</h2><table><tr><th>Anzahl</th><th>Wert</th><th>Spieler</th><th>Mannschaft</th></tr><tr><td>2</td><td>180</td><td>Jauch, Marco</td><td>${expected.heim}</td></tr></table>
<h2>Bestleistungen High Finishes</h2><table><tr><td>1</td><td>120</td><td>B&#xE4;r, Tobias</td><td>${expected.gast}</td></tr></table>
<h2>Bestleistungen Low Darts</h2><table><tr><td>1</td><td>18</td><td>Schneck, Ferdinand<br/>Jauch, Marco</td><td>${expected.heim}</td></tr></table>`;

test("Gesamtspielplan-URL: Gruppen/Teams, HTTPS und eindeutige Gruppenbindung", () => {
  const normalized = new URL(nuligaSpielplanUrl(base));
  assert.equal(normalized.searchParams.get("displayDetail"), "meetings");
  assert.equal(normalized.searchParams.get("displayTyp"), "gesamt");
  assert.equal(normalized.searchParams.get("group"), "211748");
  assert.equal(new URL(nuligaSpielplanUrl(base.replace("groupPage", "teamPortrait") + "&teamtable=1530990")).pathname, normalized.pathname);
  assert.equal(new URL(nuligaSpielplanUrl(base.replace("groupPage", "teamSchedule"))).pathname, normalized.pathname);
  for (const invalid of [
    base.replace("https:", "http:"), base.replace("bdv-dart.liga.nu", "bdv-dart.liga.nu.evil.test"),
    base.replace("bdv-dart.liga.nu", "user:password@bdv-dart.liga.nu"),
    base.replace("bdv-dart.liga.nu", "bdv-dart.liga.nu:8443"),
    base.replace("group=211748&", ""), base.replace("&championship=MFr+2026%2F27", ""),
    base.replace("groupPage", "groupMeetingReport"), base.replace("groupPage", "unknown"),
  ]) assert.equal(nuligaSpielplanUrl(invalid), null, invalid);
});

test("Spielplan: exakte Teams, Ergebnislinks und Datum leerer Wiederholungszellen", () => {
  const html = schedule(
    scheduleRow(),
    scheduleRow({ date: "", home: "Other Team", away: expected.heim, href: endpoint.replace("6112027", "6112028") }),
    scheduleRow({ home: "TSG 08 Roth III", href: endpoint.replace("6112027", "6112029") }),
    scheduleRow({ home: "TSG 08 Roth", href: endpoint.replace("6112027", "6112030") }),
    scheduleRow({ home: "TSG 08 Roth II extra", href: endpoint.replace("6112027", "6112031") }),
    scheduleRow({ score: "0:0", href: endpoint.replace("6112027", "6112032") }),
    scheduleRow({ href: "https://evil.test/wa/groupMeetingReport?meeting=1" }),
    scheduleRow(),
  );
  const links = parseNuligaBerichtLinks(html, base, expected.heim);
  assert.equal(links.length, 2);
  assert.equal(links[0].heim, expected.heim);
  assert.equal(links[1].gast, expected.heim);
  assert.equal(links[1].datum, "2026-09-18");
  assert.equal(new URL(links[0].url).searchParams.get("meeting"), "6112027");
  assert.equal(parseNuligaBerichtLinks(schedule(scheduleRow({ home: "TSG 08 Roth" })), base, "TSG 08 Roth I").length, 1);
  assert.equal(parseNuligaBerichtLinks(schedule(scheduleRow({ date: "31.02.2026" })), base, expected.heim).length, 0);
});

test("Ergebnisse: Heim-/Gastsicht und kampflose Wertung ohne erfundenen Bericht", () => {
  const html = schedule(
    scheduleRow(),
    scheduleRow({ date: "", home: "Other Team", away: expected.heim, score: "18:0", href: null }),
    scheduleRow({ date: "10.10.2026", home: "Future Team", away: expected.heim, score: "0:0" }),
    scheduleRow({ date: "19.09.2026", home: "Other Team", away: expected.heim, score: "0:0", href: null }),
  );
  const results = parseNuligaErgebnisse(html, base, expected.heim);
  assert.deepEqual(results.map(({ heim, gast, datum, ergebnis, berichtUrl }) =>
    ({ heim, gast, datum, ergebnis, hasReport: berichtUrl !== null })), [
    { ...expected, ergebnis: "12:6", hasReport: true },
    { heim: "Other Team", gast: expected.heim, datum: expected.datum, ergebnis: "0:18", hasReport: false },
  ]);
  assert.equal(parseNuligaBerichtLinks(html, base, expected.heim).length, 1);
});

test("Ergebnisse: alle sechs Mannschaften bleiben exakt getrennt; I ist ein Alias", () => {
  const teams = ["TSG 08 Roth", "TSG 08 Roth II", "TSG 08 Roth III", "TSG 08 Roth IV", "TSG 08 Roth V", "TSG 08 Roth VI"];
  const html = schedule(...teams.map((home, i) => scheduleRow({ home, score: `${18 - i}:${i}`, href: null })),
    scheduleRow({ home: "TSG 08 Roth II extra", href: null }));
  teams.forEach((team, i) => {
    const results = parseNuligaErgebnisse(html, base, i === 0 ? "TSG 08 Roth I" : team);
    assert.equal(results.length, 1, team);
    assert.equal(results[0].heim, team);
    assert.equal(results[0].ergebnis, `${18 - i}:${i}`);
  });
});

test("Ergebnisse: fremde oder mehrdeutige Berichtslinks bleiben einfache Ergebnisse", () => {
  for (const href of [
    endpoint.replace("group=211748", "group=211700"),
    endpoint.replace("MFr+2026%2F27", "MFr+2025%2F26"),
    endpoint.replace("/cgi-bin/", "https://other.liga.nu/cgi-bin/"),
    endpoint.replace("groupMeetingReport", "groupPage"),
    endpoint.replace("meeting=6112027", "meeting=6112027&amp;meeting=6112028"),
    "https://evil.test/wa/groupMeetingReport?meeting=1",
  ]) {
    const html = schedule(scheduleRow({ href }));
    const results = parseNuligaErgebnisse(html, base, expected.heim);
    assert.equal(results.length, 1, href);
    assert.equal(results[0].ergebnis, "12:6", href);
    assert.equal(results[0].berichtUrl, null, href);
    assert.equal(parseNuligaBerichtLinks(html, base, expected.heim).length, 0, href);
  }
  const ambiguousAnchor = scheduleRow().replace("</a>", `<\/a><a href="${endpoint.replace("6112027", "6112028")}"></a>`);
  assert.equal(parseNuligaErgebnisse(schedule(ambiguousAnchor), base, expected.heim)[0].berichtUrl, null);
  const duplicateReports = schedule(scheduleRow(), scheduleRow({ href: endpoint.replace("6112027", "6112028") }), scheduleRow());
  assert.equal(parseNuligaErgebnisse(duplicateReports, base, expected.heim)[0].berichtUrl, null);
  assert.equal(parseNuligaBerichtLinks(duplicateReports, base, expected.heim).length, 0);
  assert.deepEqual(parseNuligaErgebnisse(schedule(scheduleRow(), scheduleRow({ score: "6:12" })), base, expected.heim), []);
  assert.deepEqual(parseNuligaErgebnisse(schedule(scheduleRow()), base + "&group=211700", expected.heim), []);
});

test("Abgeschlossener Bericht: 18 Spiele, Doppel, Entities und Bestleistungen", () => {
  const parsed = parseNuligaSpielberichtHtml(report, expected);
  assert.equal(parsed.ok, true, parsed.fehler);
  assert.equal(parsed.bericht.spiele.length, 18);
  assert.equal(parsed.bericht.ergebnis, "12:6");
  assert.equal(parsed.bericht.legsGesamt, "42:18");
  assert.deepEqual(parsed.bericht.spiele.at(-1).unsere, ["Schneck, Ferdinand", "Jauch, Marco"]);
  assert.deepEqual(parsed.bericht.spiele.at(-1).gegner, ["Bär, Tobias", "Choroba, Maximilian"]);
  assert.deepEqual(parsed.bericht.bestleistungen.map((b) => b.kategorie), ["180", "highfinish", "lowdarts", "lowdarts"]);
  assert.equal(parsed.bericht.bestleistungen[1].name, "Bär, Tobias");
  assert.equal(parsed.bericht.bestleistungen.at(-1).mannschaft, expected.heim);
});

test("Ungespielte, beschädigte oder fremde Berichte werden abgewiesen", () => {
  for (const invalid of [
    report.replace(matchRow("1-1", true), matchRow("1-1", true).replace("3:0", "0:0")),
    report.replace(matchRow("1-1", true), matchRow("1-1", true).replaceAll("1:0", "0:0")),
    report.replace("Legs:&nbsp;42:18", "Legs:&nbsp;41:18"),
    report.replace("Legs:&nbsp;42:18", "Legs:&nbsp;0:0"),
    report.replace("<td>Schneck, Ferdinand</td>", "<td>&nbsp;</td>"),
    report.replace(matchRow("1-1", true), ""),
    report.replace("Legs:&nbsp;42:18", ""),
    report.replace("18.09.2026", "31.02.2026"),
  ]) assert.equal(parseNuligaSpielberichtHtml(invalid).ok, false);
  assert.equal(parseNuligaSpielberichtHtml(report, { ...expected, datum: "2026-09-19" }).ok, false);
  assert.equal(parseNuligaSpielberichtHtml(report, { ...expected, heim: "TSG 08 Roth III" }).ok, false);
  assert.equal(parseNuligaSpielberichtHtml(report, { ...expected, heim: expected.gast, gast: expected.heim }).ok, false);
  const firstTeam = report.replaceAll("TSG 08 Roth II", "TSG 08 Roth");
  assert.equal(parseNuligaSpielberichtHtml(firstTeam, { ...expected, heim: "TSG 08 Roth I" }).ok, true);
});

test("Frisch geladene öffentliche nuLiga-Quelle: 18 Spiele, 12:6 und 43:27", (t) => {
  const reportFile = path.join(root, "tmp/nuliga-statistik-report.html");
  const scheduleFile = path.join(root, "tmp/nuliga-statistik-schedule.html");
  if (!fs.existsSync(reportFile) || !fs.existsSync(scheduleFile)) {
    t.skip("Öffentliche HTML-Snapshots aus tmp nicht vorhanden; synthetische Fälle laufen unabhängig.");
    return;
  }
  const match = { heim: "Finnigan's Harp Nbg. III", gast: "TSG 08 Roth II", datum: "2026-09-18" };
  const parsed = parseNuligaSpielberichtHtml(fs.readFileSync(reportFile, "utf8"), match);
  assert.equal(parsed.ok, true, parsed.fehler);
  assert.equal(parsed.bericht.spiele.length, 18);
  assert.equal(parsed.bericht.ergebnis, "12:6");
  assert.equal(parsed.bericht.legsGesamt, "43:27");
  assert.equal(parsed.bericht.uebersprungen, 0);
  const links = parseNuligaBerichtLinks(fs.readFileSync(scheduleFile, "utf8"), base, "TSG 08 Roth II");
  assert.equal(links.length, 1);
  assert.deepEqual({ heim: links[0].heim, gast: links[0].gast, datum: links[0].datum }, match);
  const results = parseNuligaErgebnisse(fs.readFileSync(scheduleFile, "utf8"), base, "TSG 08 Roth II");
  assert.equal(results.length, 1);
  assert.equal(results[0].ergebnis, "12:6");
  assert.equal(results[0].berichtUrl, links[0].url);
});

test("Sechs frische nuLiga-Spielpläne: alle neun Screenshotspiele und Originalscore-Perspektive", (t) => {
  const fixtures = [
    { group: "211700", team: "TSG 08 Roth", queryTeam: "TSG 08 Roth I", matches: [
      { heim: "Dartkings Rohr", gast: "TSG 08 Roth", datum: "2026-09-19", originalScore: "11:9" },
      { heim: "TSG 08 Roth", gast: "Rezat Dart Devils", datum: "2026-09-26", originalScore: "12:8" },
    ] },
    { group: "211748", team: "TSG 08 Roth II", matches: [
      { heim: "Finnigan's Harp Nbg. III", gast: "TSG 08 Roth II", datum: "2026-09-18", originalScore: "6:12" },
    ] },
    { group: "211773", team: "TSG 08 Roth III", matches: [
      { heim: "TSG 08 Roth III", gast: "DSC Hesselberg III", datum: "2026-09-18", originalScore: "12:4" },
    ] },
    { group: "211749", team: "TSG 08 Roth IV", matches: [
      { heim: "Finnigan's Harp Nbg. VIII", gast: "TSG 08 Roth IV", datum: "2026-09-25", originalScore: "6:6" },
    ] },
    { group: "211752", team: "TSG 08 Roth V", matches: [
      { heim: "TSG 08 Roth V", gast: "DC Alfalter III", datum: "2026-09-20", originalScore: "11:1" },
      { heim: "TSV 66 Mühlstetten e.V. II", gast: "TSG 08 Roth V", datum: "2026-09-26", originalScore: "3:9" },
    ] },
    { group: "211751", team: "TSG 08 Roth VI", matches: [
      { heim: "DC Dröhnland", gast: "TSG 08 Roth VI", datum: "2026-09-25", originalScore: "2:10" },
      { heim: "Nesselbacher Schbigger Syndikat", gast: "TSG 08 Roth VI", datum: "2026-10-02", originalScore: "12:0" },
    ] },
  ];
  if (fixtures.some(({ group }) => !fs.existsSync(path.join(root, `tmp/nuliga-ergebnisse-${group}.html`)))) {
    t.skip("Frische Spielplan-Snapshots aller sechs Staffeln sind nicht vollständig vorhanden.");
    return;
  }
  let total = 0;
  for (const { group, team, queryTeam, matches } of fixtures) {
    const html = fs.readFileSync(path.join(root, `tmp/nuliga-ergebnisse-${group}.html`), "utf8");
    const sourceRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
        cell[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()));
    const results = parseNuligaErgebnisse(html, base.replace("211748", group), queryTeam ?? team);
    assert.equal(results.length, matches.length, team);
    for (const [i, { originalScore, ...match }] of matches.entries()) {
      assert.ok(sourceRows.some((cells) => cells[4] === match.heim && cells[5] === match.gast && cells[6] === originalScore),
        `${team}: Originalscore ${originalScore} steht in der erwarteten nuLiga-Spielzeile`);
      const { ergebnis, berichtUrl, ...actual } = results[i];
      assert.deepEqual(actual, match, team);
      assert.equal(ergebnis, match.heim === team ? originalScore : originalScore.split(":").reverse().join(":"), team);
      assert.ok(berichtUrl, team);
      assert.equal(new URL(berichtUrl).searchParams.get("group"), group, team);
    }
    total += results.length;
  }
  assert.equal(total, 9);
});

test("Neun frische nuLiga-Berichte: Ligamodi mit 12, 16, 18 und 20 Spielen", (t) => {
  const teams = [
    { group: "211700", team: "TSG 08 Roth", games: 20 },
    { group: "211748", team: "TSG 08 Roth II", games: 18 },
    { group: "211773", team: "TSG 08 Roth III", games: 16 },
    { group: "211749", team: "TSG 08 Roth IV", games: 12 },
    { group: "211752", team: "TSG 08 Roth V", games: 12 },
    { group: "211751", team: "TSG 08 Roth VI", games: 12 },
  ];
  if (teams.some(({ group }) => !fs.existsSync(path.join(root, `tmp/nuliga-ergebnisse-${group}.html`)))) {
    t.skip("Spielplan-Snapshots zum Ermitteln aller neun Berichte sind nicht vollständig vorhanden.");
    return;
  }
  const reports = teams.flatMap(({ group, team, games }) =>
    parseNuligaErgebnisse(fs.readFileSync(path.join(root, `tmp/nuliga-ergebnisse-${group}.html`), "utf8"),
      base.replace("211748", group), team).map((match) => ({ ...match, team, games,
      file: match.berichtUrl ? path.join(root, `tmp/nuliga-bericht-${new URL(match.berichtUrl).searchParams.get("meeting")}.html`) : null,
    })));
  if (reports.some(({ file }) => !file || !fs.existsSync(file))) {
    t.skip("Frische HTML-Berichte aus allen sechs Spielplänen sind nicht vollständig vorhanden.");
    return;
  }
  assert.equal(reports.length, 9);
  const modes = new Set();
  for (const { file, games, team, ergebnis, heim, gast, datum } of reports) {
    const parsed = parseNuligaSpielberichtHtml(fs.readFileSync(file, "utf8"), { heim, gast, datum });
    assert.equal(parsed.ok, true, `${team} ${datum}: ${parsed.fehler}`);
    assert.equal(parsed.bericht.spiele.length, games, `${team} ${datum}`);
    assert.equal(parsed.bericht.ergebnis, ergebnis, `${team} ${datum}`);
    assert.equal(parsed.bericht.uebersprungen, 0, `${team} ${datum}`);
    modes.add(parsed.bericht.spiele.length);
  }
  assert.deepEqual([...modes].sort((a, b) => a - b), [12, 16, 18, 20]);
});
