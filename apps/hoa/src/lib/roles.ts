// Role vocabulary and landing pages (BL-168). Pure: no Next, no Supabase, so
// client components, unit tests and lib/auth.ts ('use server', async
// exports only) can all import it.

export type Role = 'admin' | 'board' | 'resident' | 'cpa' | 'attorney'
export type ProfessionalRole = 'cpa' | 'attorney'
export type OfficerTitle = 'president' | 'vice_president' | 'secretary' | 'treasurer' | 'director'

export const ROLES: readonly Role[] = ['admin', 'board', 'resident', 'cpa', 'attorney']

export function isProfessionalRole(role: unknown): role is ProfessionalRole {
  return role === 'cpa' || role === 'attorney'
}

/** The landing page for a role (also where a wrong-role request is sent). */
export function homeFor(role: Role): string {
  switch (role) {
    case 'resident':
      return '/resident'
    case 'cpa':
    case 'attorney':
      return '/pro'
    default:
      return '/'
  }
}

/**
 * Is a professional grant past its end? A missing expiry is expired (the
 * database requires one for cpa and attorney, so a null means something is
 * wrong and fails closed).
 */
export function grantExpired(accessExpiresAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!accessExpiresAt) return true
  const t = Date.parse(accessExpiresAt)
  return Number.isNaN(t) || t <= now
}
