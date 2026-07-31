import { Alert } from '@homeowner-portal/ui'
import { requireAdmin } from '@/lib/auth'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getConnectPreview, getMailboxStatus, type ConnectPreview } from '@/lib/inbox/queries'
import { loadScopeOptions } from '@/lib/inbox/connect'
import { MailboxConnectCard } from './MailboxConnectCard'

export const metadata = { title: 'Mailbox' }
export const dynamic = 'force-dynamic'

export default async function MailboxSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>
}) {
  const params = await searchParams
  await requireAdmin()
  const org = await getCurrentOrg()
  if (!org) return null

  const supabase = await getSupabaseServerClient()
  const status = await getMailboxStatus(supabase, org.id)

  // Both calls below can fail independently of the connection status
  // itself — loadScopeOptions calls Gmail (expired credentials, a network
  // blip) and getConnectPreview reads recent threads/messages. Neither
  // failure may blank the page or hide whether a mailbox is connected, so
  // each is caught on its own and degrades to an empty/absent value
  // rather than throwing past this point.
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
      console.error('MailboxSettingsPage: getConnectPreview failed', previewResult.reason)
    }

    if (scopeResult.status === 'fulfilled') {
      scopeOptions = scopeResult.value
    } else {
      console.error('MailboxSettingsPage: loadScopeOptions failed', scopeResult.reason)
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mailbox</h1>
        <p className="text-sm text-muted">
          Connect the mailbox residents email, so their messages appear in HomeownerHub.
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

      <MailboxConnectCard
        status={status}
        preview={preview}
        scopeOptions={scopeOptions}
        returnTo="/settings/mailbox"
      />
    </main>
  )
}
