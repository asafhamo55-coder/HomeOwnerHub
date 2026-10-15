import Link from 'next/link'
import { Card, CardContent, Page } from '@homeowner-portal/ui'
import { UploadForm } from './UploadForm'

export const metadata = { title: 'Upload document' }

export default function UploadPage() {
  return (
    <Page
      width="narrow"
      title="Upload a document"
      description="CC&Rs, bylaws, rules or minutes. Files are private to your association."
      breadcrumbs={[{ label: 'Documents', href: '/documents' }, { label: 'Upload' }]}
      linkAs={Link}
    >
      <Card>
        <CardContent className="pt-5">
          <UploadForm />
        </CardContent>
      </Card>
    </Page>
  )
}
