import { NextResponse } from "next/server";
import { cronAuthorizationError } from "@/lib/cron-auth";
import { syncAllNuligaTeams } from "@/lib/nuliga-sync";

// Täglicher, geschützter nuLiga-Abgleich. Vercel ruft diesen GET-Endpunkt
// gemäß vercel.json auf und sendet CRON_SECRET als Bearer-Header mit.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const authError = cronAuthorizationError(request);
  if (authError) return authError;

  try {
    const result = await syncAllNuligaTeams();
    return NextResponse.json(
      { ...result, ausgefuehrtAm: new Date().toISOString() },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Der automatische nuLiga-Abgleich konnte nicht gestartet werden." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
