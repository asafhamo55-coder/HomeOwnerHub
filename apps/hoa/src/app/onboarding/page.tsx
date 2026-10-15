import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { WizardStepper } from '@homeowner-portal/ui'
import { getCurrentOrg } from '@/lib/orgs'
import { AuthHeader, AuthPanel, AuthShell } from '@/components/auth/AuthShell'
import { OnboardingForm } from './OnboardingForm'
import { ONBOARDING_STEPS } from './steps'

export const metadata = { title: 'Create your HOA' }

export default async function OnboardingPage() {
  // Already onboarded? Send them home.
  const org = await getCurrentOrg()
  if (org) redirect('/')

  return (
    <AuthShell width="md">
      <WizardStepper steps={ONBOARDING_STEPS} currentIndex={0} vertical={false} />
      <AuthPanel>
        <AuthHeader
          icon={<Building2 />}
          title="Create your HOA"
          description="Name your association to open its workspace. It takes less than a minute, and you can change everything later."
        />
        <OnboardingForm />
      </AuthPanel>
    </AuthShell>
  )
}
