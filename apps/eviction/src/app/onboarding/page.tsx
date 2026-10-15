import { redirect } from 'next/navigation'
import { AuthFrame } from '@/components/auth/AuthFrame'
import { getCurrentOrg } from '@/lib/orgs'
import { OnboardingForm } from './OnboardingForm'

export const metadata = { title: 'Create workspace' }

export default async function OnboardingPage() {
  const org = await getCurrentOrg()
  if (org) redirect('/')

  return (
    <AuthFrame>
      <div className="space-y-5">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Welcome to Eviction Hub</h1>
          <p className="text-sm text-muted">Set up your workspace to start filing cases.</p>
        </div>
        <OnboardingForm />
      </div>
    </AuthFrame>
  )
}
