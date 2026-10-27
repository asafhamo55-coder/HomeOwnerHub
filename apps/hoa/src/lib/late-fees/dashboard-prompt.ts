// BL-147: the dashboard prompt for a Georgia association with no late-fee
// policy. Pure (no I/O) so the rule is unit-tested; the dashboard section
// reads the role, the association row and the dismiss cookie and passes
// them in. The statute text shown is the verbatim quotes from law.ts.

import { lateFeeLaw, lateFeeStateOf, type LateFeeLaw } from './law'
import { readLateFeePolicy } from './store'

export const LATE_FEE_SETTINGS_HREF = '/settings/late-fees'

export function lateFeePromptDismissedCookie(orgId: string): string {
  return `hoa_latefee_prompt_off_${orgId}`
}

export interface LateFeePromptInput {
  role: string | null | undefined
  association: {
    id: string
    state: string | null
    governing_law_state: string | null
    type: string | null
    compliance_settings: unknown
  } | null
  secret: string | null
  dismissed: boolean
}

export interface LateFeePrompt {
  law: LateFeeLaw
}

/**
 * Board/admin only, Georgia only, and only while no policy has been saved
 * (state 'none'). A policy that fails its signature check is not "none":
 * the settings screen already warns about it, so no second prompt here.
 */
export function lateFeePrompt(input: LateFeePromptInput): LateFeePrompt | null {
  if (input.role !== 'board' && input.role !== 'admin') return null
  if (input.dismissed || !input.association) return null
  const a = input.association
  const state = lateFeeStateOf(a)
  if (state !== 'GA') return null
  if (readLateFeePolicy(a.id, a.compliance_settings, input.secret).state !== 'none') return null
  const law = lateFeeLaw(state, a.type)
  return law ? { law } : null
}
