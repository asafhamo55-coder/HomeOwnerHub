import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@homeowner-portal/db/types'

// Dev-only auto-login. Gated by DEV_AUTOLOGIN=1; returns 404 otherwise so
// the route is invisible in prod. Uses the service-role key to mint a
// magic-link token for DEV_AUTOLOGIN_EMAIL, then verifies it server-side
// to set real Supabase session cookies — so the rest of the app (RLS,
// (dashboard)/layout, org queries) works unchanged.
export async function GET(request: NextRequest) {
  if (process.env.DEV_AUTOLOGIN !== '1') {
    return new NextResponse('Not Found', { status: 404 })
  }

  const email = process.env.DEV_AUTOLOGIN_EMAIL
  if (!email) {
    return new NextResponse(
      'DEV_AUTOLOGIN_EMAIL is not set. Add it to apps/hoa/.env.local.',
      { status: 500 },
    )
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return new NextResponse(
      'SUPABASE_SERVICE_ROLE_KEY is not set — required for dev auto-login.',
      { status: 500 },
    )
  }

  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error || !data?.properties?.hashed_token) {
    console.error('[dev-login] generateLink failed', { email, error })
    return new NextResponse('dev-login failed', { status: 500 })
  }

  const supabase = await getSupabaseServerClient()
  const { error: otpError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  })
  if (otpError) {
    console.error('[dev-login] verifyOtp failed', otpError)
    return new NextResponse('dev-login failed', { status: 500 })
  }

  const next = new URL(request.url).searchParams.get('redirect') ?? '/'
  return NextResponse.redirect(new URL(next, request.url))
}
