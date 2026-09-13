import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Supabase client singletons (server + browser).
 *
 * The same project hosts two distinct clients:
 *  - `getSupabaseServer()` — requires the service role key. Used for
 *    server-side listing / deleting objects and for issuing signed upload
 *    URLs.
 *  - `getSupabaseBrowser()` — uses the anon key, safe to ship to the
 *    client. Used by direct browser uploads (`uploadToSignedUrl`).
 *
 * Both clients read their credentials from `NEXT_PUBLIC_SUPABASE_URL` plus
 * one of the key vars. The anon key is intentionally public (`NEXT_PUBLIC_*`)
 * and is therefore NOT an authorization boundary — it must never be used for
 * privileged server-side operations.
 */

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to .env.local (and your Vercel project env)."
    )
  }
  return url
}

function getAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Add it to .env.local (and your Vercel project env)."
    )
  }
  return key
}

function getServiceRoleKey(): string | undefined {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key && key.length > 0 ? key : undefined
}

let serverClient: SupabaseClient | null = null
let browserClient: SupabaseClient | null = null

/**
 * Server-side Supabase client. Requires the service role key.
 *
 * The anon key is shipped to every browser (`NEXT_PUBLIC_*`) and is not an
 * authorization boundary. Silently falling back to it would either grant
 * the public key the privileges these operations need, or fail opaquely
 * when RLS denies the anon role. Both are worse than a loud error, so we
 * refuse to construct the client without `SUPABASE_SERVICE_ROLE_KEY`.
 */
export function getSupabaseServer(): SupabaseClient {
  if (serverClient) return serverClient
  const serviceRoleKey = getServiceRoleKey()
  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY. Server-side Storage operations require the service role key; the public anon key is not used as a fallback."
    )
  }
  serverClient = createClient(getSupabaseUrl(), serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return serverClient
}

/**
 * Browser-safe Supabase client. Uses only the anon key — safe to import
 * from `"use client"` modules. The instance is created lazily so server
 * builds don't initialise it.
 */
export function getSupabaseBrowser(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error(
      "getSupabaseBrowser() can only be called on the client. Use getSupabaseServer() in server code."
    )
  }
  if (browserClient) return browserClient
  browserClient = createClient(getSupabaseUrl(), getAnonKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return browserClient
}

/**
 * Returns true when `SUPABASE_SERVICE_ROLE_KEY` is configured. Useful for
 * routes that need to escalate privileges (e.g. listing objects across
 * all sessions). When false, the anon key is used and the request is
 * subject to RLS.
 */
export function hasServiceRole(): boolean {
  return getServiceRoleKey() !== undefined
}