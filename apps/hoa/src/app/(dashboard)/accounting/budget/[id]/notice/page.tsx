import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, Button, LoadFailed, Page } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getAccountingContext } from '@/lib/accounting/queries'
import { tryLoad } from '@/lib/load-or-fail'
import { periodLabel } from '@/lib/money/format'
import { loadBudgetNoticeInput } from '@/lib/budget-notice/load'
import { VERIFY_DISCLAIMER } from '@/lib/budget-notice/law'
import { noticeProblem } from '@/lib/budget-notice/model'
import { LegalDisclaimer } from '@/components/knowledge/LegalDisclaimer'
import { AccountingLoadFailed, AccountingNotSetUp, accountingCrumbs } from '../../../_components/shared'
import { BudgetNotice } from './BudgetNotice'

export const metadata = { title: 'Owner budget notice' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * /accounting/budget/[id]/notice — prepare the annual budget notice to
 * owners from an adopted budget (BL-091). Board and admins only; anyone
 * else gets a 404. Nothing is sent from here: the board prints it, or
 * opens it as a draft in the communications wizard and sends it there.
 */
export default async function BudgetNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, role] = await Promise.all([params, getCurrentUserRole()])
  if (!role || (role.role !== 'admin' && role.role !== 'board')) notFound()
  if (!UUID.test(id)) notFound()

  const crumbs = accountingCrumbs(['Budgets', '/accounting/budget'], ['Budget', `/accounting/budget/${id}`], ['Owner notice'])
  const ctxRes = await tryLoad('accounting context', getAccountingContext)
  if (!ctxRes.ok) return <AccountingLoadFailed title="Owner budget notice" what="this budget" breadcrumbs={crumbs} />
  const ctx = ctxRes.data
  if (!ctx) return <AccountingNotSetUp title="Owner budget notice" returnTo={`/accounting/budget/${id}/notice`} />

  const page = (body: React.ReactNode, title = 'Owner budget notice') => (
    <Page width="default" linkAs={Link} breadcrumbs={crumbs} title={title}>
      <div className="space-y-5">
        <p className="text-sm text-foreground-secondary print:hidden">
          The adopted budget, written up for owners: each category, the totals and what each home pays, with the lines your state asks for.
        </p>
        {body}
      </div>
    </Page>
  )

  const loaded = await tryLoad('budget notice', () => loadBudgetNoticeInput(ctx, id))
  if (!loaded.ok) return page(<LoadFailed what="this budget and its assessment schedule" hint="No notice was prepared." />)
  if (!loaded.data) notFound()
  const { input, today } = loaded.data
  const title = `Owner budget notice${input.period ? ` · ${periodLabel(input.period)}` : ''}`

  const problem = noticeProblem(input)
  if (problem) {
    return page(
      <Alert
        variant="warning"
        title="This budget isn’t adopted yet"
        actions={
          <Button asChild variant="secondary">
            <Link href={`/accounting/budget/${id}`}>Back to the budget</Link>
          </Button>
        }
      >
        {problem}
      </Alert>,
      title,
    )
  }

  return page(
    <div className="space-y-5">
      <BudgetNotice input={input} today={today} />
      <div className="print:hidden">
        <LegalDisclaimer>{VERIFY_DISCLAIMER}</LegalDisclaimer>
      </div>
    </div>,
    title,
  )
}
