import { notFound } from 'next/navigation'
import { EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { M8_APPLIED } from '@homeowner-portal/db/m8'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { dollars } from '@/lib/online-payments/autopay'

export const metadata = { title: 'Autopay' }
export const dynamic = 'force-dynamic'

// BL-036 board view, read-only: who is enrolled and each limit. Never the
// payment method (RLS on online_payment_methods hides it from the board, and
// this page does not select it). Dark behind M8_APPLIED.
export default async function BoardAutopayPage() {
  if (!M8_APPLIED) notFound()
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('autopay_enrollments')
    .select('id, max_cents, status, include_other_charges, unit:units(unit_number, address_line1)')
    .eq('organization_id', org.id)
    .in('status', ['active', 'paused'])
    .order('created_at', { ascending: true })
    .range(0, 499)
  if (error) {
    return (
      <Page title="Autopay">
        <LoadFailed what="the autopay list" hint="Nothing was changed. Try again in a minute." />
      </Page>
    )
  }
  const rows = (data ?? []) as Array<{
    id: string
    max_cents: number
    status: string
    include_other_charges: boolean
    unit: { unit_number: string | null; address_line1: string | null } | null
  }>
  return (
    <Page title="Autopay" description="Homes that pay dues automatically. Each homeowner sets their own limit.">
      {rows.length === 0 ? (
        <EmptyState title="No one has turned on autopay yet" description="Homeowners turn it on from their Dues screen." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border text-base">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
              <span className="font-medium">{r.unit?.unit_number ? `Unit ${r.unit.unit_number}` : (r.unit?.address_line1 ?? 'Home')}</span>
              <span>
                Limit {dollars(r.max_cents)}
                {r.include_other_charges ? ', includes late fees and fines' : ''}
                {r.status === 'paused' ? ', paused' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Page>
  )
}
