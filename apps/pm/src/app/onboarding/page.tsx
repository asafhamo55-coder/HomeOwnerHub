import { redirect } from 'next/navigation'
import { Card, CardContent } from '@homeownerhub/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { OnboardingForm } from './OnboardingForm'

export const metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const org = await getCurrentOrg()
  if (org) redirect('/')

  return (
    <main className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-muted">Welcome to PM Hub</h1>
          <p className="text-sm text-muted-fg">
            Track rent, automate late fees, file evictions when it&apos;s time.
          </p>
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
