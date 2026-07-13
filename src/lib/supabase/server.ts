import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";

// Supabase-Client für den Server (Server Components, Route Handlers,
// Server Actions). Nutzt die Cookies der aktuellen Anfrage für die Session.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // In reinen Server Components kann kein Cookie gesetzt werden.
          // Das übernimmt die Middleware – hier bewusst ignorieren.
        }
      },
    },
  });
}
