import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { UploadForm } from './UploadForm'

export const metadata = { title: 'Upload document' }

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/documents"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to documents
      </Link>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Upload a document</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadForm />
        </CardContent>
      </Card>
    </div>
  )
}
