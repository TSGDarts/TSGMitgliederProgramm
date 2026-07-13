// Zeitzonen-Hilfen für Europe/Berlin.

function lastSunday(year: number, month: number): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay();
  return lastDay - weekday;
}

export function berlinOffset(y: number, m: number, d: number): string {
  const t = Date.UTC(y, m - 1, d);
  const dstStart = Date.UTC(y, 2, lastSunday(y, 3));
  const dstEnd = Date.UTC(y, 9, lastSunday(y, 10));
  return t >= dstStart && t < dstEnd ? "+02:00" : "+01:00";
}

/**
 * Wandelt den Wert eines <input type="datetime-local"> (z. B. "2025-09-13T19:00",
 * gemeint als deutsche Ortszeit) in eine korrekte ISO-Zeit um.
 */
export function berlinLocalToISO(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:00${berlinOffset(+y, +mo, +d)}`;
}
