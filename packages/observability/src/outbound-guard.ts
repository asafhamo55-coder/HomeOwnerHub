/**
 * Outbound safety guard (BL-004) — the one choke point every outbound
 * channel passes recipients through before a provider is called.
 *
 * Rule: outside production, nothing reaches a recipient who is not on the
 * allowlist. "Production" means exactly `VERCEL_ENV === 'production'`;
 * anything else — preview, development, a local `next dev`, a vitest run,
 * a tsx script with real keys — is non-production. That is deliberate: the
 * guard fails CLOSED, so an unset or misspelled env var blocks rather than
 * sends.
 *
 * Production can opt back into the guard per org:
 * `associations.compliance_settings.outbound_mode = 'sandbox'` (jsonb, no
 * migration) makes every send for that org obey the allowlist too, so a
 * board can trial a feature on live infrastructure without reaching
 * residents.
 *
 * Env:
 *   OUTBOUND_ALLOWLIST  comma-separated. Each entry is one of
 *     - an email               owner@example.com     (exact, case-insensitive)
 *     - an @domain or domain   @example.test, example.test
 *                              (that exact domain; not subdomains)
 *     - a phone number         +1 404 555 1234       (compared as digits;
 *                              a US leading 1 is optional)
 *     - a push user id         user:<auth user uuid> (web push targets
 *                              users, not addresses)
 *   Unset or empty → nobody is allowed outside production.
 *
 * Blocked recipients are dropped and logged with channel, counts and a
 * caller-supplied id (`ref`) only. Never an address, phone, subject or body.
 *
 * Pure apart from `fetchOrgSandbox`, which takes any Supabase-shaped client.
 * Ratchet: outbound-guard.ratchet.test.ts fails if a provider SDK is used
 * anywhere that does not route through this module.
 */

export type OutboundChannel = 'email' | 'sms' | 'push' | 'gmail'

export type EnvLike = Record<string, string | undefined>

export interface Allowlist {
  emails: ReadonlySet<string>
  domains: ReadonlySet<string>
  phones: ReadonlySet<string>
  userIds: ReadonlySet<string>
}

export interface OutboundPolicy {
  /** true → only allowlisted recipients are delivered. */
  enforce: boolean
  reason: 'non_production' | 'org_sandbox' | null
  allowlist: Allowlist
}

export interface GuardLogger {
  warn: (message: string, meta?: Record<string, unknown>) => void
}

// Defined in ./send-status (no imports, so screens and test mocks of this
// module can read it); re-exported here where every sender already looks.
export { OUTBOUND_BLOCKED_ERROR } from './send-status'

const defaultLogger: GuardLogger = {
  warn: (message, meta) => console.warn(message, meta),
}

function processEnv(): EnvLike {
  return typeof process !== 'undefined' && process.env ? process.env : {}
}

// ─── Allowlist parsing ──────────────────────────────────────────────

/** Digits only; a leading US country code 1 on an 11-digit number dropped. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
}

/** Pull the bare address out of `Name <addr>` and lowercase it. */
function normalizeEmail(raw: string): string {
  const angle = raw.match(/<([^>]+)>/)
  return (angle ? angle[1] : raw).trim().toLowerCase()
}

const PHONE_ENTRY = /^\+?[\d\s().-]{7,}$/

export function parseAllowlist(raw: string | undefined): Allowlist {
  const emails = new Set<string>()
  const domains = new Set<string>()
  const phones = new Set<string>()
  const userIds = new Set<string>()

  for (const part of (raw ?? '').split(',')) {
    const entry = part.trim()
    if (!entry) continue
    if (entry.toLowerCase().startsWith('user:')) {
      const id = entry.slice(5).trim()
      if (id) userIds.add(id)
    } else if (entry.startsWith('@')) {
      const domain = entry.slice(1).toLowerCase()
      if (domain) domains.add(domain)
    } else if (entry.includes('@')) {
      emails.add(normalizeEmail(entry))
    } else if (PHONE_ENTRY.test(entry)) {
      const digits = normalizePhone(entry)
      if (digits) phones.add(digits)
    } else if (entry.includes('.')) {
      domains.add(entry.toLowerCase())
    }
    // Anything else is ignored: an unrecognised entry must never widen
    // what is allowed.
  }
  return { emails, domains, phones, userIds }
}

export function isAllowlisted(
  channel: OutboundChannel,
  recipient: string | null | undefined,
  allowlist: Allowlist,
): boolean {
  if (!recipient || !recipient.trim()) return false

  if (channel === 'push') return allowlist.userIds.has(recipient.trim())

  if (channel === 'sms') {
    const digits = normalizePhone(recipient)
    return digits.length > 0 && allowlist.phones.has(digits)
  }

  // email / gmail
  const address = normalizeEmail(recipient)
  const at = address.lastIndexOf('@')
  if (at <= 0 || at === address.length - 1) return false
  if (allowlist.emails.has(address)) return true
  return allowlist.domains.has(address.slice(at + 1))
}

// ─── Policy ─────────────────────────────────────────────────────────

export function resolveOutboundPolicy(
  opts: { env?: EnvLike; orgSandbox?: boolean } = {},
): OutboundPolicy {
  const env = opts.env ?? processEnv()
  const allowlist = parseAllowlist(env.OUTBOUND_ALLOWLIST)
  if (env.VERCEL_ENV !== 'production') {
    return { enforce: true, reason: 'non_production', allowlist }
  }
  if (opts.orgSandbox) return { enforce: true, reason: 'org_sandbox', allowlist }
  return { enforce: false, reason: null, allowlist }
}

export interface GuardOptions {
  env?: EnvLike
  /** The org's `compliance_settings.outbound_mode === 'sandbox'`. */
  orgSandbox?: boolean
  /** An id to correlate the log line with (communication id, draft id…). */
  ref?: string
  logger?: GuardLogger
}

export interface GuardResult<T> {
  allowed: T[]
  blocked: T[]
  /** `allowedMask[i]` belongs to `items[i]` — for positional callers. */
  allowedMask: boolean[]
  policy: OutboundPolicy
}

/**
 * Split `items` into those that may be delivered and those that may not.
 * The single decision point for every channel.
 */
export function guardRecipients<T>(
  channel: OutboundChannel,
  items: readonly T[],
  recipientOf: (item: T) => string | null | undefined,
  opts: GuardOptions = {},
): GuardResult<T> {
  const policy = resolveOutboundPolicy({ env: opts.env, orgSandbox: opts.orgSandbox })
  if (!policy.enforce) {
    return { allowed: [...items], blocked: [], allowedMask: items.map(() => true), policy }
  }

  const allowed: T[] = []
  const blocked: T[] = []
  const allowedMask = items.map((item) => {
    const ok = isAllowlisted(channel, recipientOf(item), policy.allowlist)
    ;(ok ? allowed : blocked).push(item)
    return ok
  })

  if (blocked.length > 0) {
    ;(opts.logger ?? defaultLogger).warn(
      `[outbound-guard] blocked ${blocked.length} of ${items.length} ${channel} recipient(s)`,
      {
        channel,
        blocked: blocked.length,
        total: items.length,
        reason: policy.reason,
        ref: opts.ref ?? null,
      },
    )
  }
  return { allowed, blocked, allowedMask, policy }
}

// ─── Per-org sandbox flag ───────────────────────────────────────────

export function isOrgSandbox(complianceSettings: unknown): boolean {
  return (
    typeof complianceSettings === 'object' &&
    complianceSettings !== null &&
    (complianceSettings as Record<string, unknown>).outbound_mode === 'sandbox'
  )
}

/**
 * Whether any association of `organizationId` is in sandbox mode.
 * Fails CLOSED: if the flag cannot be read, the org is treated as
 * sandboxed, because the failure to avoid is a send that should have been
 * blocked. Outside production this changes nothing (already enforced).
 */
export async function fetchOrgSandbox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: { from: (table: string) => any },
  organizationId: string,
  logger: GuardLogger = defaultLogger,
): Promise<boolean> {
  try {
    const { data, error } = (await db
      .from('associations')
      .select('compliance_settings')
      .eq('organization_id', organizationId)) as {
      data: { compliance_settings: unknown }[] | null
      error: { message?: string; code?: string } | null
    }
    if (error) {
      logger.warn('[outbound-guard] could not read outbound_mode; treating org as sandbox', {
        organizationId,
        code: error.code ?? null,
      })
      return true
    }
    return (data ?? []).some((row) => isOrgSandbox(row.compliance_settings))
  } catch {
    logger.warn('[outbound-guard] outbound_mode lookup threw; treating org as sandbox', {
      organizationId,
    })
    return true
  }
}
