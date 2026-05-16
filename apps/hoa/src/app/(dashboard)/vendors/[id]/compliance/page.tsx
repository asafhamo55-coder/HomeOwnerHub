import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Alert } from '@homeowner-portal/ui'
import { getVendor } from '@/lib/vendors'
import { ComplianceForm } from './ComplianceForm'
import { DocumentUploader } from './DocumentUploader'

export const metadata = { title: 'Vendor compliance check' }

export default async function VendorCompliancePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const vendor = await getVendor(id)
  if (!vendor) notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href={`/vendors/${vendor.id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to {vendor.legal_name}
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-muted">Compliance check</h1>
        <p className="text-sm text-muted-fg">
          Enter what's on the vendor's COI, W-9, and license. W21 will grade
          them against your association's standards and return a color-coded
          status with a deficiency list.
        </p>
      </header>

      <Alert variant="info" title="Vision/OCR is not yet live">
        Upload the PDFs for your records, but for now you also need to type
        the values into the form below. When the self-hosted vision model
        comes online, the upload step will read these fields straight from
        the ACORD-25 PDF.
      </Alert>

      <DocumentUploader vendorId={vendor.id} documents={vendor.documents} />

      <ComplianceForm vendorId={vendor.id} />
    </div>
  )
}
