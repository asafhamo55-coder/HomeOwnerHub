import Link from 'next/link'
import { Card, CardContent, Page } from '@homeowner-portal/ui'
import { NewRfpForm } from './NewRfpForm'

export const metadata = { title: 'New RFP' }

export default function NewRfpPage() {
  return (
    <Page
      width="narrow"
      title="Draft an RFP"
      description="Describe the need and the composer drafts a structured RFP — scope, line items, evaluation criteria — with insurance minimums copied from your association’s settings, never invented."
      breadcrumbs={[{ label: 'RFPs', href: '/rfps' }, { label: 'New RFP' }]}
      linkAs={Link}
    >
      <Card>
        <CardContent className="pt-5">
          <NewRfpForm />
        </CardContent>
      </Card>
    </Page>
  )
}
