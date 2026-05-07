'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@homeownerhub/db/types'

let _client: ReturnType<typeof createBrowserClient<Database>> | null = null

// Singleton pattern: a single browser client per page load avoids duplicate
// auth listeners and unnecessary websocket fanout.
export function getSupabaseBrowserClient() {
  if (_client) return _client
  _client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return _client
}
