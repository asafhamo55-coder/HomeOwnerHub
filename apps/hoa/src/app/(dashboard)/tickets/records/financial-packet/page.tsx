import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LoadFailed, Page } from '@homeowner-portal/ui'
import { RECORDS_REQUESTS_LIVE } from '@homeowner-portal/db/records-requests'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { getAccountingContext } from '@/lib/accounting/queries'
import { DEFAULT_ASSOCIATION_TIME_ZONE } from '@/lib/association-time'
import { formatDay, todayIso } from '@/lib/money/format'
import { GA_2027_ACCOUNTING_SENTENCE, GA_2027_RECORDS } from '@/lib/records-requests/law'
import { loadFinancialPacket } from '@/lib/records-requests/financial-packet-load'
import { PrintPacketButton } from '../../../meetings/[id]/packet/PrintPacketButton'
import { FinancialPacketView } from './FinancialPacketView'

export const metadata = { title: '3-year financial packet' }
export const dynamic = 'force-dynamic'

/**
 * BL-162: the 3-year financial packet for an owner's records request — the
 * finalized balance sheet, adopted budget and income statement for each of
 * the last three fiscal years, plus a checklist of the bank statements in
 * Documents. Board and admin only (requireBoardOrAdmin; the accounting
 * reads are RLS-bound). Owner-safe: totals by account, no home, owner,
 * vendor or bank number. Nothing is sent from here; the board prints it or
 * saves a PDF and replies in the request.
 */
export default async function FinancialPacketPage() {
  if (!RECORDS_REQUESTS_LIVE) notFound()
  const { org } = await requireBoardOrAdmin()
  const supabase = await getSupabaseServerClient()

  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  const ctx = ctxRes.ok ? ctxRes.data : null
  const today = todayIso(ctx?.timeZone ?? DEFAULT_ASSOCIATION_TIME_ZONE)

  const crumbs = [{ label: 'Tickets', href: '/tickets' }, { label: 'Records requests', href: '/tickets/records' }, { label: 'Financial packet' }]
  const loaded = await loadFinancialPacket({ supabase, orgId: org.id, ctx, ctxFailed: !ctxRes.ok, today })
  if (!loaded.ok) {
    return (
      <Page title="3-year financial packet" breadcrumbs={crumbs} linkAs={Link}>
        <LoadFailed what={loaded.what} hint="The packet needs it to know which years to cover. Reload to try again." />
      </Page>
    )
  }
  const { packet } = loaded

  return (
    <Page
      width="wide"
      eyebrow={packet.associationName}
      title="3-year financial packet"
      description={`The last three finalized fiscal years. Prepared ${formatDay(packet.preparedOn)}.`}
      breadcrumbs={crumbs}
      linkAs={Link}
      actions={
        <span className="print:hidden">
          <PrintPacketButton />
        </span>
      }
    >
      <div className="space-y-2 rounded-lg border border-border bg-subtle px-4 py-3 text-sm text-foreground-secondary print:hidden">
        <p>
          For an owner who asked for the accounting records. It shows totals by account only: no home, owner, vendor or bank
          number. Check it, attach the bank statements, then print it or save it as a PDF and reply in the request. Nothing is sent
          from this page.
        </p>
        <p className="text-xs">
          Georgia, from Jan 1, 2027 ({GA_2027_RECORDS.cite}): “{GA_2027_ACCOUNTING_SENTENCE}”
        </p>
      </div>

      <FinancialPacketView packet={packet} />
    </Page>
  )
}
