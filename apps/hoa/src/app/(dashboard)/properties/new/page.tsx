import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { PropertyForm } from './PropertyForm'

export const metadata = { title: 'Add property' }

export default function NewPropertyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/properties"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to properties
      </Link>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Add a property</CardTitle>
        </CardHeader>
        <CardContent>
          <PropertyForm />
        </CardContent>
      </Card>
    </div>
  )
}
