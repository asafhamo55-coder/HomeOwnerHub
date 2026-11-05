// Shared rule for every server-only HMAC signing secret in apps/hoa.
//
// A dedicated secret (PAY_SETTINGS_SECRET, SESSION_CAP_SECRET) is required in
// production. The database service key must never double as a signing key
// there: it sits in git history, so anyone holding it could forge signatures.
// Outside production (VERCEL_ENV !== 'production') the service key fallback
// stays so local runs and tests need no setup.
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

/** Returns the dedicated secret, or (non-production only) the service-key fallback, or null. */
export function resolveSigningSecret(
  dedicatedName: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  const dedicated = env[dedicatedName]
  if (dedicated) return dedicated
  if (env.VERCEL_ENV === 'production') {
    // Name only, never a value.
    console.error(`[signing-secret] ${dedicatedName} is not set in production; refusing the service-key fallback`)
    throw new MissingSigningSecretError(dedicatedName)
  }
  return env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY || null
}
