import { NextResponse } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeReturnTo, startConnect } from '@/lib/inbox/connect'

export async function GET(request: Request): Promise<Response> {
  const org = await getCurrentOrg()
  if (!org) return NextResponse.redirect(new URL('/onboarding', request.url))

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  // `returnTo` is attacker-controllable query input (a board member can
  // be sent a crafted link and will complete a genuine Google consent
  // screen). Validate it here, before it is ever signed into `state` —
  // signing does not "launder" a hostile value, it just certifies one.
  const returnTo = sanitizeReturnTo(new URL(request.url).searchParams.get('returnTo'))

  try {
    return NextResponse.redirect(startConnect(org.id, user.id, returnTo))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start connection.'
    return NextResponse.redirect(
      new URL(`${returnTo}?error=${encodeURIComponent(message)}`, request.url),
    )
  }
}
