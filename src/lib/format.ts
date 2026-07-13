const TZ = "Europe/Berlin";

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: TZ,
});

const timeFmt = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});

export function formatDate(value: string | Date): string {
  return dateFmt.format(new Date(value));
}

export function formatTime(value: string | Date): string {
  return timeFmt.format(new Date(value));
}

export function formatDateTime(value: string | Date): string {
  return `${formatDate(value)}, ${formatTime(value)} Uhr`;
}

export function isPast(value: string | Date): boolean {
  return new Date(value).getTime() < Date.now();
}
