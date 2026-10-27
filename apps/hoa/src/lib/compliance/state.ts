/**
 * The association's compliance state, kept free of node:crypto so client
 * components (e.g. Settings > Association) can import it. deadlines.ts
 * re-exports both names, so existing imports keep working.
 */
export type ComplianceState = 'GA' | 'FL' | 'CA' | 'TX'

const STATE_NAMES: Record<string, ComplianceState> = {
  GA: 'GA',
  GEORGIA: 'GA',
  FL: 'FL',
  FLORIDA: 'FL',
  CA: 'CA',
  CALIFORNIA: 'CA',
  TX: 'TX',
  TEXAS: 'TX',
}

/** The association's state for compliance purposes: its governing-law state, else its address state. */
export function complianceState(
  governingLawState: string | null | undefined,
  state: string | null | undefined,
): ComplianceState | null {
  for (const raw of [governingLawState, state]) {
    const s = (raw ?? '').trim().toUpperCase()
    if (s) return STATE_NAMES[s] ?? null
  }
  return null
}
