// Shared rule for every server-only HMAC signing secret in apps/hoa.
//
// A dedicated secret (PAY_SETTINGS_SECRET, SESSION_CAP_SECRET) is required in
// production. The database service key must never double as a signing key
// there: it sits in git history, so anyone holding it could forge signatures.
// Outside production (VERCEL_ENV !== 'production') the service key fallback
// stays so local runs and tests need no setup.
//
// Two flavours, so a missing secret fails closed PER FEATURE, never as a
// site-wide outage:
//   - resolveSigningSecret: returns null in production when the dedicated
//     secret is missing. Every existing caller already treats null as "off /
//     not set up / unverified", which is the fail-closed answer.
//   - requireSigningSecret: throws MissingSigningSecretError. Only for a
//     caller that catches it and fails closed itself (the session cap).
//
// Dependency-free on purpose: packages/jobs imports files that use it.

export class MissingSigningSecretError extends Error {
  constructor(public readonly secretName: string) {
    super(
      `${secretName} is not set in production. Refusing to fall back to the database service key; ` +
        `set ${secretName} in the Vercel production environment.`,
    )
    this.name = 'MissingSigningSecretError'
  }
}

const logged = new Set<string>()

/** Log once per secret name per process (name only, never a value). */
function logMissingOnce(name: string): void {
  if (logged.has(name)) return
  logged.add(name)
  console.error(`[signing-secret] ${name} is not set in production; refusing the service-key fallback`)
}

/** Test hook: forget which names were already logged. */
export function resetSigningSecretLogForTests(): void {
  logged.clear()
}

/** The dedicated secret, or (non-production only) the service-key fallback, or null. Never throws. */
export function resolveSigningSecret(
  dedicatedName: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const dedicated = env[dedicatedName]
  if (dedicated) return dedicated
  if (env.VERCEL_ENV === 'production') {
    logMissingOnce(dedicatedName)
    return null
  }
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || null
}

/** Like resolveSigningSecret, but throws MissingSigningSecretError in production. The caller must catch it. */
export function requireSigningSecret(
  dedicatedName: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const dedicated = env[dedicatedName]
  if (!dedicated && env.VERCEL_ENV === 'production') {
    logMissingOnce(dedicatedName)
    throw new MissingSigningSecretError(dedicatedName)
  }
  return resolveSigningSecret(dedicatedName, env)
}
