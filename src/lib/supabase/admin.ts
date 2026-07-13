import "server-only";

import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
} from "./config";

/**
 * Supabase-Client mit "service_role"-Rechten.
 *
 * ACHTUNG: umgeht sämtliche Sicherheitsregeln (RLS). Darf ausschließlich
 * serverseitig (Server Actions / Route Handler) und nur nach einer eigenen
 * Admin-Prüfung verwendet werden – z. B. um neue Zugänge anzulegen.
 */
export function createAdminSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY fehlt. Bitte in .env.local / bei Vercel hinterlegen.",
    );
  }
  return createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
