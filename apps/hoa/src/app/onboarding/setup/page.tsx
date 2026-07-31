import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Alert } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  getConnectPreview,
  getMailboxStatus,
  getSetupProgress,
  type ConnectPreview,
} from '@/lib/inbox/queries'
import { loadScopeOptions } from '@/lib/inbox/connect'
import { MailboxConnectCard } from '../../(dashboard)/settings/mailbox/MailboxConnectCard'
import { SetupChecklist } from './SetupChecklist'

export const metadata = { title: 'Finish setting up' }
export const dynamic = 'force-dynamic'

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>
}) {
  const params = await searchParams
  const org = await getCurrentOrg()
  if (!org) redirect('/onboarding')

  const supabase = await getSupabaseServerClient()
  const [steps, status] = await Promise.all([
    getSetupProgress(supabase, org.id),
    getMailboxStatus(supabase, org.id),
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
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome to {org.name}</h1>
        <p className="text-sm text-muted">
          A few steps to get set up. You can come back to this any time.
        </p>
      </div>

      {params.error ? (
        <Alert variant="error" title="Could not connect">
          {params.error}
        </Alert>
      ) : null}
      {params.connected ? (
        <Alert variant="success" title="Mailbox connected">
          We are importing your history now. Counts below fill in as it runs.
        </Alert>
      ) : null}

      <SetupChecklist steps={steps} highlightKey="mailbox" />

      <div className="pt-2">
        <MailboxConnectCard
          status={status}
          preview={preview}
          scopeOptions={scopeOptions}
          returnTo="/onboarding/setup"
        />
      </div>

      <p className="text-center text-xs text-muted">
        <Link href="/" className="underline">
          Skip for now — go to dashboard
        </Link>
      </p>
    </main>
  )
}
