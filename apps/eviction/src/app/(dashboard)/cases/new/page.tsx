import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { Wizard } from './Wizard'

export const metadata = { title: 'New case' }

export default async function NewCasePage() {
  const org = await getCurrentOrg()
  if (!org) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to cases
      </Link>

      <Card variant="elevated">
        <CardHeader>
          <CardTitle>Open a new case</CardTitle>
        </CardHeader>
        <CardContent>
          <Wizard workspaceName={org.name} />
        </CardContent>
      </Card>
    </div>
  )
}
