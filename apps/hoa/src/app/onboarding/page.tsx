import Link from 'next/link'
import { redirect } from 'next/navigation'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
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
        {/* BL-143: an owner whose HOA is already here asks to join instead. */}
        {M5_APPLIED ? (
          <p className="mt-6 text-center text-sm text-muted">
            Already in an HOA that uses HomeownerHub?{' '}
            <Link href="/join" className="font-medium text-primary">
              Ask to join your home
            </Link>
          </p>
        ) : null}
      </AuthPanel>
    </AuthShell>
  )
}
