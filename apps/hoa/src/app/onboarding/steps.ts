import type { WizardStep } from '@homeowner-portal/ui'

/** The two onboarding screens, shown as one stepper so the path is visible. */
export const ONBOARDING_STEPS: WizardStep[] = [
  { id: 'create', label: 'Create your HOA' },
  { id: 'setup', label: 'Finish setting up' },
]
