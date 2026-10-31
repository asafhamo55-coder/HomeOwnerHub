import Link from 'next/link'
import { Alert, WizardStepper } from '@homeowner-portal/ui'
import { AuthShell } from '@/components/auth/AuthShell'
import { ONBOARDING_STEPS } from '../steps'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getConnectPreview, getMailboxStatus, type ConnectPreview } from '@/lib/inbox/queries'
import { loadSetupChecklist } from '@/lib/dashboard/setup-checklist'
import { loadScopeOptions } from '@/lib/inbox/connect'
import { connectErrorMessage } from '@/lib/inbox/connect-errors'
import { MailboxConnectCard } from '../../(dashboard)/settings/mailbox/MailboxConnectCard'
import { SetupChecklist } from './SetupChecklist'
import { SampleCommunityPanel } from '@/components/dashboard/SampleCommunityPanel'
import { loadSampleState } from '@/lib/sample-community/core'

export const metadata = { title: 'Finish setting up' }
export const dynamic = 'force-dynamic'

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>
}) {
  const params = await searchParams
  // Connecting a mailbox is a board/admin action — a resident should never
  // see the "Connect Google" button here, since clicking it would only
  // fail at /api/oauth/google/start anyway. Matches the bar RLS already
  // sets on the inbox tables via auth_is_board_or_admin.
  const { org } = await requireBoardOrAdmin()

  const supabase = await getSupabaseServerClient()
  // THE setup checklist (BL-127) — the same model as the dashboard card.
  // Each step's read fails on its own ("Couldn't check"), never the page.
  const [checklist, status, sampleState] = await Promise.all([
    loadSetupChecklist(supabase, org.id),
    getMailboxStatus(supabase, org.id),
    loadSampleState(supabase, org.id),
  ])

  // Both calls below can fail independently of the connection status
  // itself — loadScopeOptions calls Gmail (expired credentials, a network
  // blip) and getConnectPreview reads recent threads/messages. Neither
  // failure may blank the checklist page or hide whether a mailbox is
  // connected, so each is caught on its own and degrades to an
  // empty/absent value rather than throwing past this point. Mirrors
  // the same handling in settings/mailbox/page.tsx.
  let preview: ConnectPreview | null = null
  let scopeOptions: { addresses: string[]; labels: Array<{ id: string; name: string }> } = {
    addresses: [],
    labels: [],
  }

  if (status) {
    const [previewResult, scopeResult] = await Promise.allSettled([
      getConnectPreview(supabase, org.id, status.id),
      loadScopeOptions(status.id),
    ])

    if (previewResult.status === 'fulfilled') {
      preview = previewResult.value
    } else {
      console.error('SetupPage: getConnectPreview failed', previewResult.reason)
    }

    if (scopeResult.status === 'fulfilled') {
      scopeOptions = scopeResult.value
    } else {
      console.error('SetupPage: loadScopeOptions failed', scopeResult.reason)
    }
  }

  return (
    <AuthShell
      width="md"
      footer={
        <Link href="/" className="font-medium text-primary hover:underline">
          Skip for now and go to the dashboard
        </Link>
      }
    >
      <WizardStepper
        steps={ONBOARDING_STEPS.map((s, i) => ({ ...s, status: i === 0 ? 'done' : 'current' }))}
        currentIndex={1}
        vertical={false}
      />
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold tracking-[-0.015em] text-foreground">Welcome to {org.name}</h1>
        <p className="text-sm text-muted">A few steps to get set up. You can come back to this any time.</p>
      </div>

      {params.error ? (
        <Alert variant="error" title="Couldn’t connect the mailbox">
          {connectErrorMessage(params.error)}
        </Alert>
      ) : null}
      {params.connected ? (
        <Alert variant="success" title="Mailbox connected">
          We’re importing your history now. The counts below fill in as it runs.
        </Alert>
      ) : null}

      <SetupChecklist checklist={checklist} highlightKey="mailbox" hrefOverride={{ mailbox: '#connect-mailbox' }} />

      <SampleCommunityPanel state={sampleState} variant="compact" />

      <div id="connect-mailbox" className="scroll-mt-4">
        <MailboxConnectCard status={status} preview={preview} scopeOptions={scopeOptions} returnTo="/onboarding/setup" />
      </div>
    </AuthShell>
  )
}
