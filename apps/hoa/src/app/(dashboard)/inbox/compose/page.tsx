import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  getDraftById,
  listAttachableDocuments,
  listDraftAttachments,
} from '@/lib/inbox/queries'
import { DraftPanel } from '../[id]/DraftPanel'
import { ComposeStarter } from './ComposeStarter'

export const metadata = { title: 'New email' }
export const dynamic = 'force-dynamic'

const BREADCRUMBS = [{ label: 'Inbox', href: '/inbox' }, { label: 'New email' }]
// Stated plainly: the conversation is created by the next sync, not by the
// send, so it will not appear in the list immediately.
const DESCRIPTION = 'Once sent, this conversation appears in your inbox within a couple of minutes.'

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>
}) {
  const { draft: draftId } = await searchParams
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const { data: accounts, error } = await supabase
    .from('mailbox_accounts')
    .select('id, email_address')
    .eq('organization_id', org.id)
    .is('disconnected_at', null)
    .order('email_address', { ascending: true })

  if (error) {
    // A failed read is not "no mailbox": it used to fall through to the
    // redirect below and send the user to connect a mailbox they already have.
    console.error(`ComposePage: mailbox read failed: ${error.code}`)
    return (
      <Page title="New email" width="narrow" breadcrumbs={BREADCRUMBS} linkAs={Link}>
        <LoadFailed what="your mailbox" />
      </Page>
    )
  }
  if (!accounts || accounts.length === 0) {
    redirect('/settings/mailbox')
  }

  // No draft yet — offer to start one. The draft row must exist before the
  // composer renders, because attachments are keyed on its id.
  if (!draftId) {
    return (
      <Page title="New email" width="narrow" breadcrumbs={BREADCRUMBS} linkAs={Link} description={DESCRIPTION}>
        <ComposeStarter accounts={accounts} />
      </Page>
    )
  }

  const draft = await getDraftById(supabase, org.id, draftId)
  if (!draft) redirect('/inbox/compose')

  const [attachments, libraryFiles] = await Promise.all([
    listDraftAttachments(supabase, org.id, draft.id),
    listAttachableDocuments(supabase, org.id).catch(() => []),
  ])

  return (
    <Page title="New email" width="narrow" breadcrumbs={BREADCRUMBS} linkAs={Link} description={DESCRIPTION}>
      <DraftPanel
        threadId={null}
        draft={draft}
        attachments={attachments}
        threadFiles={[]}
        libraryFiles={libraryFiles}
      />
    </Page>
  )
}
