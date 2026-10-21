import Link from 'next/link'
import { redirect } from 'next/navigation'
import { UserPlus } from 'lucide-react'
import { Alert } from '@homeowner-portal/ui'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { AuthHeader, AuthPanel, AuthShell } from '@/components/auth/AuthShell'
import { getCurrentOrg, getSignedInUser } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { JOIN_NOT_LIVE } from '@/lib/owner-join/model'
import { loadMyJoinStatus } from '@/lib/owner-join/status'
import type { JoinDb } from '@/lib/owner-join/board'
import { AskToJoinForm } from './AskToJoinForm'

export const metadata = { title: 'Ask to join' }
export const dynamic = 'force-dynamic'

// BL-143: "Ask to join" — for an owner whose account isn't linked to a
// home (already in an HOA here, or in none). Reached from the resident
// portal's "No home linked yet" and from /onboarding. Sits outside both
// the resident and dashboard layouts, which send an account with no HOA
// to /onboarding. Flag off: no database call; the page says it's not on.

export default async function JoinPage() {
  const user = await getSignedInUser()
  if (!user) redirect('/login?redirect=/join')
  const org = await getCurrentOrg()
  const back = org ? { href: '/resident', label: 'Back to my portal' } : { href: '/onboarding', label: 'Create a new HOA instead' }

  const status = M5_APPLIED ? await loadMyJoinStatus((await getSupabaseServerClient()) as unknown as JoinDb) : null
  const left = status ? Math.max(0, status.dailyLimit - status.attemptsToday) : null

  return (
    <AuthShell width="md">
      <AuthPanel>
        <AuthHeader
          icon={<UserPlus />}
          title="Ask to join your home"
          description="Tell us which home is yours. Your board checks the request and links your account to the home — nothing is shared until they approve it."
        />
        {!M5_APPLIED ? (
          <Alert variant="info" title="Not available yet">
            {JOIN_NOT_LIVE}
          </Alert>
        ) : (
          <div className="space-y-4">
            {status?.lastAttemptAt ? (
              <p className="text-sm text-muted">
                You last asked on {new Date(status.lastAttemptAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}. Your board
                will review it; you&apos;ll see your home in your portal once they approve.
              </p>
            ) : null}
            <AskToJoinForm remaining={left} />
          </div>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href={back.href} className="font-medium text-primary">
            {back.label}
          </Link>
        </p>
      </AuthPanel>
    </AuthShell>
  )
}
