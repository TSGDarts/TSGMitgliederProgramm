import { inflateRawSync } from "node:zlib";

// Minimaler .xlsx-Leser (ohne Fremd-Bibliothek): eine .xlsx-Datei ist ein
// ZIP-Archiv. Wir lesen das zentrale Verzeichnis, entpacken die benötigten
// XML-Einträge (sharedStrings + Arbeitsblatt) per zlib und geben eine
// einfache Zell-Tabelle zurück. Reicht für die StarMoney-Auswertung.

interface ZipEntry {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
}

function readZipEntries(buf: Buffer): ZipEntry[] {
  // End-of-Central-Directory (Signatur 0x06054b50) von hinten suchen
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 22 - 65536; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Keine gültige xlsx-Datei (ZIP-Ende fehlt).");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16); // Offset des zentralen Verzeichnisses

  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break; // Central-Dir-Signatur
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({ name, method, compSize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntryText(buf: Buffer, entry: ZipEntry): string {
  // Lokaler Header: 30 Bytes fest + Dateiname + Extra
  const lh = entry.localOffset;
  if (buf.readUInt32LE(lh) !== 0x04034b50) {
    throw new Error("ZIP-Eintrag beschädigt.");
  }
  const nameLen = buf.readUInt16LE(lh + 26);
  const extraLen = buf.readUInt16LE(lh + 28);
  const start = lh + 30 + nameLen + extraLen;
  const raw = buf.subarray(start, start + entry.compSize);
  const out = entry.method === 0 ? raw : inflateRawSync(raw);
  return out.toString("utf8");
}

export interface XlsxSheet {
  /** rows[zeilennr][spaltenbuchstabe] = Zelltext */
  rows: Record<number, Record<string, string>>;
}

/** Erste Arbeitsmappe einer .xlsx als Zell-Tabelle (Text) lesen. */
export function readFirstSheet(data: ArrayBuffer): XlsxSheet {
  const buf = Buffer.from(data);
  const entries = readZipEntries(buf);

  const find = (re: RegExp) => entries.find((e) => re.test(e.name));
  const ssEntry = find(/^xl\/sharedStrings\.xml$/i);
  const sheetEntry =
    find(/^xl\/worksheets\/sheet1\.xml$/i) ||
    find(/^xl\/worksheets\/.*\.xml$/i);
  if (!sheetEntry) throw new Error("Kein Arbeitsblatt in der Datei gefunden.");

  // Gemeinsame Zeichenketten
  const strs: string[] = [];
  if (ssEntry) {
    const ss = readEntryText(buf, ssEntry);
    for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      strs.push(entdecke(m[1].replace(/<[^>]*>/g, "")));
    }
  }

  const sheet = readEntryText(buf, sheetEntry);
  const rows: Record<number, Record<string, string>> = {};
  for (const cm of sheet.matchAll(
    /<c\s+([^>]*?)>(?:<v>([\s\S]*?)<\/v>|<is>([\s\S]*?)<\/is>)?<\/c>/g,
  )) {
    const attrs = cm[1];
    const vRaw = cm[2];
    const inlineStr = cm[3];
    const refMatch = attrs.match(/r="([A-Z]+)(\d+)"/);
    if (!refMatch) continue;
    const col = refMatch[1];
    const rowNr = Number(refMatch[2]);
    const t = (attrs.match(/t="(\w+)"/) || [])[1];

    let value: string | undefined;
    if (inlineStr !== undefined) {
      value = entdecke(inlineStr.replace(/<[^>]*>/g, ""));
    } else if (vRaw !== undefined) {
      value = t === "s" ? (strs[Number(vRaw)] ?? "") : vRaw;
    }
    if (value === undefined) continue;
    (rows[rowNr] ||= {})[col] = value;
  }

  return { rows };
}

/** XML-Entities entschärfen. */
function entdecke(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");
}
