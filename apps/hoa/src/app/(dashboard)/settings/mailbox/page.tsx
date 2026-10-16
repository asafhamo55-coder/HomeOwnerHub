import Link from 'next/link'
import { Alert, NoOrgSelected, Page } from '@homeowner-portal/ui'
import { SettingsTabs } from '@/components/settings/SettingsTabs'
import { requireAdmin } from '@/lib/auth'
import { getCurrentOrg } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getConnectPreview, getMailboxStatus, type ConnectPreview } from '@/lib/inbox/queries'
import { loadScopeOptions } from '@/lib/inbox/connect'
import { mailboxConnectErrorMessage } from '@/lib/inbox/connect-errors'
import { MailboxConnectCard } from './MailboxConnectCard'

export const metadata = { title: 'HOA mailbox' }
export const dynamic = 'force-dynamic'

export default async function MailboxSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string }>
}) {
  const params = await searchParams
  await requireAdmin()
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected />

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
    <Page
      width="narrow"
      title="Settings"
      description="Connect the mailbox residents write to, so their messages land in the HOA inbox."
      tabs={<SettingsTabs current="/settings/mailbox" role="admin" />}
      linkAs={Link}
    >
      {params.error ? (
        <Alert variant="error" title="Couldn’t connect the mailbox">
          {mailboxConnectErrorMessage(params.error)}
        </Alert>
      ) : null}
      {params.connected ? (
        <Alert variant="success" title="Mailbox connected">
          We’re importing your history now. The counts below fill in as it runs.
        </Alert>
      ) : null}

      <MailboxConnectCard
        status={status}
        preview={preview}
        scopeOptions={scopeOptions}
        returnTo="/settings/mailbox"
      />
    </Page>
  )
}
