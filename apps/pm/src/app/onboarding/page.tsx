import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { getCurrentOrg } from '@/lib/orgs'
import { OnboardingForm } from './OnboardingForm'

export const metadata = { title: 'Welcome' }

export default async function OnboardingPage() {
  const org = await getCurrentOrg()
  if (org) redirect('/')

  return (
    <AuthFrame>
      <div className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome to PM Hub</h1>
          <p className="text-sm text-muted">Track rent, automate late fees, file evictions when it&apos;s time.</p>
        </div>
        <OnboardingForm />
      </div>
    </AuthFrame>
  )
}
