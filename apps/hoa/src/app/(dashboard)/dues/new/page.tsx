import Link from 'next/link'
import { Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { listUnitsForDues } from '@/lib/assessments'
import { tryLoad } from '@/lib/load-or-fail'
import { todayIn } from '@/lib/association-time'
import { currentTimeZone } from '@/lib/association-time-current'
import { NewDueForm } from './NewDueForm'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { getPrimaryAssociation } from '@/lib/vendors'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { loadDuesRates, type LooseDb } from '@/lib/dues-rates/queries'

export const metadata = { title: 'Add due' }

export default async function NewDuePage(): Promise<React.ReactElement> {
  const units = await tryLoad('properties', () => listUnitsForDues())
  // The primary association's today (BL-065) — listUnitsForDues bills it.
  const today = todayIn(await currentTimeZone())
  // BL-137: the dues-rate schedule, so regular dues start from the rate in
  // effect on the due date (M5_APPLIED; no read with the flag off). A
  // failed read just means no pre-fill.
  const rates = M5_APPLIED ? await loadRatesForForm() : []
  const crumbs = [{ label: 'Dues', href: '/dues' }, { label: 'Add a due' }]

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={crumbs}
      title="Add a due"
      description="Bill every property or just one — once, monthly for a year, or annually. Each charge posts to the ledger as money owed."
    >
      {!units.ok ? (
        <LoadFailed what="properties" />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <NewDueForm units={units.data} today={today} rates={rates} />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}

async function loadRatesForForm() {
  const assoc = await getPrimaryAssociation()
  if (!assoc) return []
  const supabase = await getSupabaseServerClient()
  return (await loadDuesRates(supabase as unknown as LooseDb, assoc.id)) ?? []
}
