import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import { NewVendorForm } from './NewVendorForm'

export const metadata = { title: 'New vendor' }

export default function NewVendorPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/vendors"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to vendors
      </Link>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Add a vendor</CardTitle>
        </CardHeader>
        <CardContent>
          <NewVendorForm />
        </CardContent>
      </Card>
    </div>
  )
}
