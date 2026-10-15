import Link from 'next/link'
import { Card, CardContent, LoadFailed, Page } from '@homeowner-portal/ui'
import { listUnitsForDues } from '@/lib/assessments'
import { tryLoad } from '@/lib/load-or-fail'
import { NewDueForm } from './NewDueForm'

export const metadata = { title: 'Add due' }

export default async function NewDuePage(): Promise<React.ReactElement> {
  const units = await tryLoad('properties', () => listUnitsForDues())
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
            <NewDueForm units={units.data} />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
