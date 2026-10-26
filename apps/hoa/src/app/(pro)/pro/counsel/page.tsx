import { redirect } from 'next/navigation'
import { Card, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { requireRole } from '@/lib/auth'
import { getMembershipDetail } from '@/lib/orgs'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadOrFail } from '@/lib/load-or-fail'

export const metadata = { title: 'Governing documents' }
export const dynamic = 'force-dynamic'

/** General counsel only: the governing documents list (RLS: auth_counsel_org_ids). */
export default async function CounselPage() {
  const { org } = await requireRole(['attorney'] as const)
  if (!(await getMembershipDetail(org.id))?.generalCounsel) redirect('/pro/matters')
  const supabase = await getSupabaseServerClient()
  const res = await loadOrFail(
    'pro: governing documents',
    supabase.from('governing_documents').select('id, type, title, effective_date, superseded_at').order('type'),
  )
  if (!res.ok) {
    return (
      <Page title="Governing documents">
        <LoadFailed what="the governing documents" retryHref="/pro/counsel" />
      </Page>
    )
  }
  const docs = (res.data ?? []) as Array<{ id: string; type: string; title: string; effective_date: string | null; superseded_at: string | null }>
  return (
    <Page title="Governing documents" description="Read-only, as general counsel.">
      {docs.length === 0 ? (
        <EmptyState title="No governing documents on file" />
      ) : (
        <Card>
          <ul className="divide-y divide-border text-sm">
            {docs.map((d) => (
              <li key={d.id} className="flex justify-between gap-4 px-5 py-3">
                <span>{d.title}</span>
                <span className="text-foreground-secondary">
                  {d.type}
                  {d.superseded_at ? ' · superseded' : ''}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Page>
  )
}
