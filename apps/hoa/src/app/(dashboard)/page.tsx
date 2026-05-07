import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'

// Placeholder. The Daily Digest implementation lands in the next checkpoint.
export default async function DashboardHome() {
  const org = await getCurrentOrg()

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-muted">Welcome back</h1>
        <p className="mt-1 text-sm text-muted-fg">{org?.name ?? 'Your HOA'}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Dashboard scaffold ready</CardTitle>
          <CardDescription>
            Auth, onboarding, and the sidebar shell are in. Daily Digest, violations, properties,
            and documents arrive next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-fg">
            <li>Daily Digest card with Claude Haiku summary (with manual fallback)</li>
            <li>Open / overdue violation counters and Compliance Heat Map</li>
            <li>Pending approvals queue</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
