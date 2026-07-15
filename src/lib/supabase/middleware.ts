import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "./config";

/**
 * Hält die Supabase-Session bei jeder Anfrage frisch und schützt die
 * GESAMTE Website vor nicht eingeloggten Besuchern (reine Mitglieder-Seite).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Ohne konfiguriertes Supabase einfach durchreichen (z. B. beim ersten
  // Ausprobieren, bevor die Zugangsdaten hinterlegt sind).
  if (!isSupabaseConfigured) {
    return supabaseResponse;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Ohne Login erreichbar sind nur: Login, Selbst-Anmeldung (Beitritts-Link),
  // die Auth-Callbacks, das Passwort-Setzen, der öffentliche Dart-Feed und
  // der Competition-Import (Vercel-Cron; idempotent, importiert nur öffentliche Daten).
  const openPaths = [
    "/login",
    "/beitreten",
    "/passwort-setzen",
    "/api/dart-feed",
    "/api/comp-import",
  ];
  const isOpen =
    openPaths.some((p) => path === p || path.startsWith(p + "/")) ||
    path.startsWith("/auth");

  if (!user && !isOpen) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (path !== "/") url.searchParams.set("weiter", path);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
