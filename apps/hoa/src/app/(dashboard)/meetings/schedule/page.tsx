import Link from 'next/link'
import { Page } from '@homeowner-portal/ui'
import { getAccountingContext, getBudget } from '@/lib/accounting/queries'
import { adoptionAgenda } from '@/lib/budget-adoption/model'
import { tryLoad } from '@/lib/load-or-fail'
import { periodLabel } from '@/lib/money/format'
import { ScheduleMeetingForm, type AdoptionBudgetRef } from './ScheduleMeetingForm'

export const metadata = { title: 'Schedule meeting' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `?budget=<id>` (BL-138): scheduling the meeting that adopts that budget.
 * The agenda is prefilled to say the budget and its assessments will be
 * considered (the meeting notice is prefilled from it), and the new
 * meeting is linked to the budget's adoption kit. A budget that can't be
 * read just leaves the form plain.
 */
async function adoptionBudget(id: string | undefined): Promise<AdoptionBudgetRef | null> {
  if (!id || !UUID.test(id)) return null
  const ctx = await tryLoad('accounting context', getAccountingContext)
  if (!ctx.ok || !ctx.data) return null
  const assocId = ctx.data.associationId
  const b = await tryLoad('budget', () => getBudget(assocId, id))
  if (!b.ok || !b.data || (b.data.status !== 'draft' && b.data.status !== 'approved')) return null
  const name = `${b.data.fund?.name ?? 'Budget'}${b.data.fiscalPeriod ? ` · ${periodLabel(b.data.fiscalPeriod)}` : ''}`
  return { id: b.data.id, name, agenda: adoptionAgenda(name) }
}

export default async function ScheduleMeetingPage({ searchParams }: { searchParams: Promise<{ budget?: string }> }) {
  const { budget: budgetParam } = await searchParams
  const budget = await adoptionBudget(typeof budgetParam === 'string' ? budgetParam : undefined)
  return (
    <Page
      width="narrow"
      title={budget ? 'Schedule the budget adoption meeting' : 'Schedule a meeting'}
      description={
        budget
          ? `The board meeting that adopts the ${budget.name} budget. The agenda says the budget and its assessments will be considered; the meeting notice starts from it.`
          : 'Put the next meeting on the board calendar. It shows on the dashboard and under Upcoming until you record its minutes.'
      }
      breadcrumbs={[{ label: 'Meetings', href: '/meetings' }, { label: 'Schedule' }]}
      linkAs={Link}
    >
      <ScheduleMeetingForm budget={budget} />
    </Page>
  )
}
