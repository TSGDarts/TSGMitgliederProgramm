import "server-only";

/**
 * Vercel sendet CRON_SECRET automatisch als Authorization: Bearer ….
 * Ohne konfiguriertes Secret bleibt der mutierende Endpunkt bewusst gesperrt.
 */
export function cronAuthorizationError(request: Request): Response | null {
  const secret = process.env.CRON_SECRET?.trim();
  if (
    secret &&
    secret.length >= 16 &&
    request.headers.get("authorization") === `Bearer ${secret}`
  ) {
    return null;
  }
  return Response.json({ error: "Nicht autorisiert." }, { status: 401 });
}
