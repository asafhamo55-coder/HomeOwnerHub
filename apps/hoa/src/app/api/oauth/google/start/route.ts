import { NextResponse } from 'next/server'
import { getCurrentUserRoleInOrg } from '@/lib/auth'
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

  // This route is the actual security boundary for connecting a mailbox:
  // completeConnect writes mailbox_accounts via the admin (service-role)
  // client, which bypasses the board_access RLS policy that would
  // otherwise stop a resident. Gate here rather than trusting the calling
  // page alone.
  //
  // Admin-only, deliberately narrower than the board-or-admin bar RLS sets
  // on the inbox tables. Two reasons. First, consenting to this grant hands
  // Google standing access to the HOA's entire mailbox, and the surfaces
  // that manage it afterwards (settings/mailbox, updateScope,
  // disconnectMailbox) are all admin-only — a board member who could
  // *start* a connect could never see, rescope, or revoke it. Second, it
  // closes a silent dead end: every failure path here and in the callback
  // redirects to settings/mailbox, which requireAdmin() would bounce to '/'
  // with no message, so a board member's refusal was invisible to them.
  const role = await getCurrentUserRoleInOrg(org.id)
  if (role !== 'admin') {
    return NextResponse.redirect(
      new URL(
        `${returnTo}?error=${encodeURIComponent(
          'Only an HOA admin can connect a mailbox for this organization.',
        )}`,
        request.url,
      ),
    )
  }

  try {
    return NextResponse.redirect(startConnect(org.id, user.id, returnTo))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start connection.'
    return NextResponse.redirect(
      new URL(`${returnTo}?error=${encodeURIComponent(message)}`, request.url),
    )
  }
}
