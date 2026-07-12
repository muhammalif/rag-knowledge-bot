import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Lazy Supabase client singleton.
 *
 * Reads env at CALL TIME (not import time) so standalone `tsx` scripts can
 * load `.env.local` via dotenv first — avoids the ESM import-hoisting pitfall
 * where `process.env` would still be empty when the module graph loads.
 *
 * Uses the service_role key → bypasses RLS. Server-side ingestion only.
 * Never expose this key to the browser.
 */
export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment",
    );
  }

  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  return client;
}
