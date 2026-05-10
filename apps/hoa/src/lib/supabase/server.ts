import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@homeowner-portal/db/types'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// Use in Server Components, Server Actions, and Route Handlers.
// RLS is enforced — never use this for cross-org admin work.
export async function getSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // Server Components can't set cookies; ignore there. Server
          // Actions / Route Handlers will succeed.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            /* noop in RSC context */
          }
        },
      },
    },
  )
}
