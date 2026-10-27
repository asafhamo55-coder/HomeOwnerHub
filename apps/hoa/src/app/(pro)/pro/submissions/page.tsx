import { Card, EmptyState, LoadFailed, Page, StatusPill } from '@homeowner-portal/ui'
import { requireProfessional } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getSignedInUser } from '@/lib/orgs'
import { loadMySubmissions } from '@/lib/professionals/load'
import { PRO_ACTION_LABEL, isProAction } from '@/lib/professionals/model'

export const metadata = { title: 'My submissions' }
export const dynamic = 'force-dynamic'

const TONE: Record<string, 'info' | 'success' | 'neutral' | 'warning'> = { proposed: 'info', approved: 'success', posted: 'success', rejected: 'warning', failed: 'warning' }
const LABEL: Record<string, string> = {
  proposed: 'Waiting on the board',
  approved: 'Approved',
  posted: 'Approved',
  rejected: 'Rejected',
  failed: 'Couldn’t be completed',
}

export default async function SubmissionsPage() {
  await requireProfessional()
  const user = await getSignedInUser()
  const result = user ? await loadMySubmissions(await getSupabaseServerClient(), user.id) : ({ ok: false } as const)
  if (!result.ok) {
    return (
      <Page title="My submissions">
        <LoadFailed what="your submissions" retryHref="/pro/submissions" />
      </Page>
    )
  }
  return (
    <Page title="My submissions" description="What you sent the board and where it stands.">
      {result.rows.length === 0 ? (
        <EmptyState title="You haven’t sent anything yet" />
      ) : (
        <Card>
          <ul className="divide-y divide-border text-sm">
            {result.rows.map((r) => (
              <li key={r.id} className="space-y-1 px-5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{isProAction(r.actionType) ? PRO_ACTION_LABEL[r.actionType] : r.summary}</span>
                  <StatusPill tone={TONE[r.status] ?? 'neutral'} size="sm" label={LABEL[r.status] ?? r.status} />
                </div>
                <p className="text-foreground-secondary">{r.proposedAt.slice(0, 10)}</p>
                {r.status === 'rejected' && r.decisionReason ? <p>Board’s reason: {r.decisionReason}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  )
}
