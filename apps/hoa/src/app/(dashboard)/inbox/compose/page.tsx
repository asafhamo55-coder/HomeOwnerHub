import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  getDraftById,
  listAttachableDocuments,
  listDraftAttachments,
} from '@/lib/inbox/queries'
import { DraftPanel } from '../[id]/DraftPanel'
import { ComposeStarter } from './ComposeStarter'

export const dynamic = 'force-dynamic'

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
    console.error(`ComposePage: mailbox read failed: ${error.code} ${error.message}`)
  }
  if (!accounts || accounts.length === 0) {
    redirect('/settings/mailbox')
  }

  // No draft yet — offer to start one. The draft row must exist before the
  // composer renders, because attachments are keyed on its id.
  if (!draftId) {
    return (
      <main className="mx-auto max-w-2xl p-4">
        <Header />
        <ComposeStarter accounts={accounts} />
      </main>
    )
  }

  const draft = await getDraftById(supabase, org.id, draftId)
  if (!draft) redirect('/inbox/compose')

  const [attachments, libraryFiles] = await Promise.all([
    listDraftAttachments(supabase, org.id, draft.id),
    listAttachableDocuments(supabase, org.id).catch(() => []),
  ])

  return (
    <main className="mx-auto max-w-2xl p-4">
      <Header />
      <DraftPanel
        threadId={null}
        draft={draft}
        attachments={attachments}
        threadFiles={[]}
        libraryFiles={libraryFiles}
      />
    </main>
  )
}

function Header() {
  return (
    <header className="mb-3">
      <Link href="/inbox" className="text-xs text-muted underline">
        ← Back to the inbox
      </Link>
      <h1 className="mt-1 text-lg font-semibold text-foreground">New email</h1>
      {/* Stated plainly: the conversation is created by the next sync, not
          by the send, so it will not appear in the list immediately. */}
      <p className="text-xs text-muted">
        Once sent, this conversation appears in your inbox within a couple of minutes.
      </p>
    </header>
  )
}
