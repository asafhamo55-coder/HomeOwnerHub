import { NextResponse } from 'next/server'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { startConnect } from '@/lib/inbox/connect'

export async function GET(request: Request): Promise<Response> {
  const org = await getCurrentOrg()
  if (!org) return NextResponse.redirect(new URL('/onboarding', request.url))

  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))

  const returnTo =
    new URL(request.url).searchParams.get('returnTo') ?? '/settings/mailbox'

  try {
    return NextResponse.redirect(startConnect(org.id, user.id, returnTo))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start connection.'
    return NextResponse.redirect(
      new URL(`${returnTo}?error=${encodeURIComponent(message)}`, request.url),
    )
  }
}
