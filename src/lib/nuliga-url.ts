/** Sichere Normalisierung öffentlicher nuLiga-Adressen. */
export function normalizeNuligaUrl(
  raw: string,
  { allowWebcal = false }: { allowWebcal?: boolean } = {},
): string | null {
  let value = raw.trim();
  if (allowWebcal && /^webcal:\/\//i.test(value)) {
    value = value.replace(/^webcal:\/\//i, "https://");
  }
  if (
    !value ||
    value.length > 2048 ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    return null;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isNuligaHost =
      hostname === "liga.nu" || hostname.endsWith(".liga.nu");
    if (
      url.protocol !== "https:" ||
      !isNuligaHost ||
      url.username ||
      url.password ||
      url.port
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/** Kalenderlinks dürfen von nuLiga auch als webcal:// geliefert werden. */
export function normalizeNuligaIcalUrl(raw: string): string | null {
  return normalizeNuligaUrl(raw, { allowWebcal: true });
}
