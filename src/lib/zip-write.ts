import { deflateRawSync } from "node:zlib";

// Minimaler ZIP-Schreiber ohne Fremdpaket (Gegenstück zum eigenen
// ZIP-Leser in xlsx-read.ts) – für die Daten-Sicherung als eine Datei.
// Bewusst ohne ZIP64: weit unter 4 GB.

// CRC32 (IEEE) mit Standardtabelle
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** Datum/Uhrzeit im MS-DOS-Format (lokale Zeit des Servers reicht hier). */
function dosDatumZeit(d: Date): { datum: number; zeit: number } {
  const jahr = Math.max(1980, d.getFullYear());
  const datum = ((jahr - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const zeit =
    (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  return { datum, zeit };
}

export interface ZipEintrag {
  name: string; // Dateiname im Archiv, z. B. "tabellen/events.csv"
  inhalt: string | Buffer;
}

/** Baut aus den Einträgen eine komplette ZIP-Datei (Deflate, UTF-8-Namen). */
export function erzeugeZip(
  eintraege: ZipEintrag[],
  wann = new Date(),
): Buffer {
  const { datum, zeit } = dosDatumZeit(wann);
  const teile: Buffer[] = [];
  const zentral: Buffer[] = [];
  let offset = 0;

  for (const e of eintraege) {
    const name = Buffer.from(e.name, "utf8");
    const daten =
      typeof e.inhalt === "string" ? Buffer.from(e.inhalt, "utf8") : e.inhalt;
    const gepackt = deflateRawSync(daten);
    const pruefsumme = crc32(daten);

    // Lokaler Dateikopf
    const lokal = Buffer.alloc(30);
    lokal.writeUInt32LE(0x04034b50, 0);
    lokal.writeUInt16LE(20, 4); // benötigte Version
    lokal.writeUInt16LE(0x0800, 6); // Flag: UTF-8-Dateinamen
    lokal.writeUInt16LE(8, 8); // Methode: Deflate
    lokal.writeUInt16LE(zeit, 10);
    lokal.writeUInt16LE(datum, 12);
    lokal.writeUInt32LE(pruefsumme, 14);
    lokal.writeUInt32LE(gepackt.length, 18);
    lokal.writeUInt32LE(daten.length, 22);
    lokal.writeUInt16LE(name.length, 26);
    lokal.writeUInt16LE(0, 28); // kein Extra-Feld
    teile.push(lokal, name, gepackt);

    // Eintrag im Zentralverzeichnis
    const zd = Buffer.alloc(46);
    zd.writeUInt32LE(0x02014b50, 0);
    zd.writeUInt16LE(20, 4); // erstellt mit Version
    zd.writeUInt16LE(20, 6); // benötigte Version
    zd.writeUInt16LE(0x0800, 8);
    zd.writeUInt16LE(8, 10);
    zd.writeUInt16LE(zeit, 12);
    zd.writeUInt16LE(datum, 14);
    zd.writeUInt32LE(pruefsumme, 16);
    zd.writeUInt32LE(gepackt.length, 20);
    zd.writeUInt32LE(daten.length, 24);
    zd.writeUInt16LE(name.length, 28);
    // Extra/Kommentar/Datenträger/Attribute: alles 0
    zd.writeUInt32LE(offset, 42);
    zentral.push(zd, name);

    offset += lokal.length + name.length + gepackt.length;
  }

  const zentralGroesse = zentral.reduce((s, b) => s + b.length, 0);
  const ende = Buffer.alloc(22);
  ende.writeUInt32LE(0x06054b50, 0);
  ende.writeUInt16LE(eintraege.length, 8);
  ende.writeUInt16LE(eintraege.length, 10);
  ende.writeUInt32LE(zentralGroesse, 12);
  ende.writeUInt32LE(offset, 16);

  return Buffer.concat([...teile, ...zentral, ende]);
}
