import Link from 'next/link'
import { ArrowRight, Briefcase, CreditCard } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  KeyValue,
  KeyValueList,
  NoOrgSelected,
  Page,
} from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'

export const metadata = { title: 'Settings' }

export default async function SettingsPage() {
  const org = await getCurrentOrg()
  if (!org) return <NoOrgSelected noun="workspace" />

  return (
    <Page width="narrow" title="Settings" description="Your workspace and subscription.">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Briefcase className="size-4 text-muted" aria-hidden />
              Workspace
            </CardTitle>
            <CardDescription>Contact support to rename your workspace.</CardDescription>
          </CardHeader>
          <CardContent>
            <KeyValueList>
              <KeyValue label="Name" value={org.name} />
              <KeyValue
                label="Plan"
                value={
                  <Badge variant="neutral" size="sm">
                    {planLabel(org.plan)}
                  </Badge>
                }
              />
            </KeyValueList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            actions={
              <Button asChild variant="secondary" size="sm">
                <Link href="/settings/billing">
                  Open billing
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          >
            <CardTitle as="h2" className="flex items-center gap-2">
              <CreditCard className="size-4 text-muted" aria-hidden />
              Billing
            </CardTitle>
            <CardDescription>Investor $15/mo or Pro $29/mo.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </Page>
  )
}

function planLabel(plan: string): string {
  // PM Hub "Investor" persists as 'starter' (schema constraint).
  if (plan === 'starter') return 'Investor'
  return plan.charAt(0).toUpperCase() + plan.slice(1)
}
