// Gemeinsame Konfigurations-Helfer für Supabase.

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/**
 * True, sobald die öffentlichen Supabase-Zugangsdaten gesetzt sind.
 * Solange das nicht der Fall ist, zeigt die Website leere Zustände an,
 * anstatt mit einem Fehler abzustürzen.
 */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
