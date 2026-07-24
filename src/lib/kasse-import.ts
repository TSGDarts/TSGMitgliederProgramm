import { readFirstSheet, type XlsxSheet } from "@/lib/xlsx-read";

// Auslesen der StarMoney-„Kostenstellenauswertung" (Excel vom Hauptverein).
// Aufbau: Kopf mit Summenzeile (Einnahmen / Ausgaben / Summe) und darunter
// eine Buchungsliste in 4-Zeilen-Blöcken:
//   Zeile 1: Empfänger | Datum | Betrag
//   Zeile 2: Kategorie | Konto
//   Zeile 3: Verwendungszweck
//   Zeile 4: leer

export interface KasseBuchung {
  datum: string | null; // ISO (JJJJ-MM-TT)
  empfaenger: string;
  betrag: number | null;
  kategorie: string;
  konto: string;
  zweck: string;
}

export interface KasseAuswertung {
  stichtag: string | null; // ISO
  einnahmen: number | null;
  ausgaben: number | null;
  saldo: number | null;
  buchungen: KasseBuchung[];
}

const spaltenNr = (c: string) => {
  let n = 0;
  for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

/** "TT.MM.JJJJ" → "JJJJ-MM-TT" (oder null). */
function deDatum(s: string | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function zahl(s: string | undefined): number | null {
  if (s === undefined || s === "") return null;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** In einer Zeile die Zelle finden, deren Text exakt passt → Spalte zurück. */
function findeSpalte(
  sheet: XlsxSheet,
  rowNr: number,
  text: RegExp,
): string | null {
  const row = sheet.rows[rowNr];
  if (!row) return null;
  for (const [col, val] of Object.entries(row)) {
    if (text.test(val)) return col;
  }
  return null;
}

export function parseKostenstellenauswertung(data: ArrayBuffer): KasseAuswertung {
  const sheet = readFirstSheet(data);
  const rowNrs = Object.keys(sheet.rows)
    .map(Number)
    .sort((a, b) => a - b);

  // 1) Stichtag: aus dem Zeitraum "TT.MM.JJJJ - TT.MM.JJJJ" (Ende) oder
  //    dem Erstellungsdatum. Wir suchen die ersten Datumsangaben im Kopf.
  let stichtag: string | null = null;
  for (const r of rowNrs.slice(0, 6)) {
    for (const val of Object.values(sheet.rows[r] ?? {})) {
      const bereich = val.match(/\d{2}\.\d{2}\.\d{4}\s*-\s*(\d{2}\.\d{2}\.\d{4})/);
      if (bereich) {
        stichtag = deDatum(bereich[1]);
        break;
      }
      const einzel = val.match(/^(\d{2}\.\d{2}\.\d{4})/);
      if (einzel && !stichtag) stichtag = deDatum(einzel[1]);
    }
    if (stichtag) break;
  }

  // 2) Summenzeile: Labels „Einnahmen"/„Ausgaben"/„Summe" finden, Wert steht
  //    in derselben Spalte eine Zeile darunter.
  let einnahmen: number | null = null;
  let ausgaben: number | null = null;
  let saldo: number | null = null;
  for (const r of rowNrs.slice(0, 12)) {
    const cE = findeSpalte(sheet, r, /^Einnahmen$/i);
    const cA = findeSpalte(sheet, r, /^Ausgaben$/i);
    const cS = findeSpalte(sheet, r, /^Summe$/i);
    if (cE || cA || cS) {
      const werte = sheet.rows[r + 1] ?? {};
      if (cE) einnahmen = zahl(werte[cE]);
      if (cA) ausgaben = zahl(werte[cA]);
      if (cS) saldo = zahl(werte[cS]);
      break;
    }
  }

  // 3) Spalten der Buchungstabelle aus der Kopfzeile bestimmen (Datum,
  //    Betrag, Empfänger). Kategorie/Konto stehen wegen verbundener Zellen
  //    in anderen Spalten als ihre Kopf-Labels – die holen wir per Zeilen-Scan.
  let headerRow = -1;
  let colEmpf = "N";
  let colDatum = "P";
  let colBetrag = "T";
  for (const r of rowNrs) {
    const cD = findeSpalte(sheet, r, /^Datum$/i);
    const cB = findeSpalte(sheet, r, /^Betrag$/i);
    if (cD && cB) {
      headerRow = r;
      colDatum = cD;
      colBetrag = cB;
      colEmpf = findeSpalte(sheet, r, /Empf/i) ?? colEmpf;
      break;
    }
  }
  if (headerRow < 0) {
    throw new Error(
      "Diese Datei sieht nicht wie eine StarMoney-Kostenstellenauswertung aus (Spalten Datum/Betrag nicht gefunden).",
    );
  }

  // 4) Buchungen: ab der ersten Datenzeile ist jede Zeile mit Datum UND
  //    Betrag der Kopf eines 4-Zeilen-Blocks; die zwei folgenden Zeilen
  //    liefern Kategorie/Konto bzw. Verwendungszweck.
  const buchungen: KasseBuchung[] = [];
  for (const r of rowNrs) {
    if (r <= headerRow) continue;
    const row = sheet.rows[r];
    if (!row) continue;
    const betrag = zahl(row[colBetrag]);
    const datum = deDatum(row[colDatum]);
    if (betrag === null || datum === null) continue; // kein Buchungskopf

    const empfaenger = (row[colEmpf] ?? "").trim();
    const zeile2 = sheet.rows[r + 1] ?? {};
    const zeile3 = sheet.rows[r + 2] ?? {};

    // Kategorie/Konto: die belegten Textzellen der 2. Zeile heranziehen;
    // die Zelle mit langer Nummer/„Kontokorrent" ist das Konto.
    const zellen2 = Object.entries(zeile2)
      .filter(([, v]) => (v ?? "").trim())
      .sort((a, b) => spaltenNr(a[0]) - spaltenNr(b[0]))
      .map(([, v]) => v.trim());
    const kontoIdx = zellen2.findIndex((v) => /kontokorrent|\d{6,}/i.test(v));
    const konto = kontoIdx >= 0 ? zellen2[kontoIdx] : (zellen2[1] ?? "");
    const kategorie = zellen2.find((v, i) => i !== kontoIdx) ?? "";

    buchungen.push({
      datum,
      empfaenger,
      betrag,
      kategorie,
      konto,
      zweck: (zeile3[colEmpf] ?? "").trim(),
    });
  }

  return { stichtag, einnahmen, ausgaben, saldo, buchungen };
}
