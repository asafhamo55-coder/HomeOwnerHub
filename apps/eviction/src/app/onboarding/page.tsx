import { redirect } from 'next/navigation'
import { Card, CardContent } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { OnboardingForm } from './OnboardingForm'

export const metadata = { title: 'Create workspace' }

export default async function OnboardingPage() {
  const org = await getCurrentOrg()
  if (org) redirect('/')

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-foreground">Welcome to Eviction Hub</h1>
          <p className="text-sm text-muted">Set up your workspace to start filing cases.</p>
        </div>
        <Card variant="elevated">
          <CardContent className="p-6 pt-6">
            <OnboardingForm />
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
