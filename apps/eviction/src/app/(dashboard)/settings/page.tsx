import Link from 'next/link'
import { Briefcase, CreditCard } from 'lucide-react'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const org = await getCurrentOrg()
  if (!org) return null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-muted">Settings</h1>
        <p className="mt-1 text-sm text-muted-fg">
          Manage your workspace and subscription.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Briefcase className="h-4 w-4 text-muted-fg" />
            Workspace
          </CardTitle>
          <CardDescription>
            Editing these values will be added in a later checkpoint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Name">{org.name}</Row>
          <Row label="Plan">
            <Badge variant="outline" size="sm">
              {org.plan}
            </Badge>
          </Row>
          <Row label="Hub type">{org.hub_type}</Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4 text-muted-fg" />
            Billing
          </CardTitle>
          <CardDescription>
            Per-case ($249) or unlimited ($99/mo). Card on file in Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/billing"
            className="text-sm font-medium text-primary hover:underline"
          >
            Open billing →
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs uppercase tracking-wide text-muted-fg">{label}</span>
      <span className="text-muted">{children}</span>
    </div>
  )
}
