import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { getVendor } from '@/lib/vendors'
import { ComplianceForm } from './ComplianceForm'
import { DocumentUploader } from './DocumentUploader'
import { ManualOverrideCard } from './ManualOverrideCard'

export const metadata = { title: 'Vendor compliance check' }

export default async function VendorCompliancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [loaded, ctx] = await Promise.all([getVendor(id), getCurrentUserRole()])
  if (!loaded.ok) {
    if (loaded.reason === 'error') return <LoadFailed what="this vendor" retryHref={`/vendors/${id}/compliance`} />
    notFound()
  }
  const { vendor, documentsFailed, complianceFailed } = loaded

  // Only board/admin can override the AI compliance grade. Residents
  // shouldn't be in this tree anyway (layout redirects them) but defense
  // in depth — and we use this to decide whether to render the card.
  const canOverride = ctx?.role === 'admin' || ctx?.role === 'board'

  return (
    <Page
      width="narrow"
      title="Compliance check"
      description="Enter what’s on the vendor’s COI, W-9 and license. The check grades them against your association’s standards and lists any deficiencies."
      breadcrumbs={[
        { label: 'Vendors', href: '/vendors' },
        { label: vendor.legal_name, href: `/vendors/${vendor.id}` },
        { label: 'Compliance' },
      ]}
      linkAs={Link}
    >
      <Alert variant="info" title="Document reading isn’t live yet">
        Upload the PDFs for your records, and type the values into the form below. Once document
        reading is available, the upload will fill these fields from the ACORD-25 certificate.
      </Alert>

      {documentsFailed ? (
        <Alert variant="error" title="Couldn’t load documents">
          The documents already uploaded for this vendor did not load, so the list below is not shown. Reload
          to try again.
        </Alert>
      ) : null}
      {complianceFailed ? (
        <Alert variant="error" title="Couldn’t load insurance status">
          The current compliance record did not load, so the current grade is not shown. Reload to try again.
        </Alert>
      ) : null}

      {documentsFailed ? null : <DocumentUploader vendorId={vendor.id} documents={vendor.documents} />}

      <ComplianceForm vendorId={vendor.id} />

      {canOverride && !complianceFailed ? (
        <ManualOverrideCard vendorId={vendor.id} currentStatus={vendor.compliance?.coi_status ?? null} />
      ) : null}
    </Page>
  )
}
