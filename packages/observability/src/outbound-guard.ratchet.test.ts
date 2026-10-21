import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Outbound ratchet (BL-004). Every way this codebase can put a message in
 * front of a person must route through outbound-guard.ts. This scans
 * source as text and fails when:
 *
 *   1. a provider SDK (Resend, Vonage, web-push, or any of the usual
 *      alternatives) is imported anywhere but the known transport modules;
 *   2. a known transport module stops calling `guardRecipients`;
 *   3. the raw Gmail send endpoint appears outside packages/mailbox's
 *      send.ts, or `sendReply` (the function that hits it) is called from
 *      anywhere but the guarded mailbox-send job;
 *   4. an entry in the lists below no longer matches anything — so a
 *      removed transport is also removed here instead of lingering.
 *
 * Adding a channel means adding its module to TRANSPORTS *and* making it
 * call guardRecipients, which is the point: the test makes the bypass a
 * visible, reviewed choice rather than an accident. Text scanning is crude:
 * it proves these patterns are absent, nothing more. The behavioural proof
 * that each transport actually blocks lives next to it
 * (outbound-guard-wiring.test.ts, mailbox-send.test.ts, web-push.test.ts).
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../..')
const SCAN_ROOTS = ['apps', 'packages', 'scripts']
const SKIP_DIRS = new Set(['node_modules', '.next', '.turbo', 'dist', 'build', 'coverage'])

function walk(dir: string): string[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out: string[] = []
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full)
  }
  return out
}

const sources = new Map<string, string>(
  SCAN_ROOTS.flatMap((r) => walk(path.join(repoRoot, r))).map((f) => [
    path.relative(repoRoot, f).split(path.sep).join('/'),
    readFileSync(f, 'utf8'),
  ]),
)

/** Every module allowed to talk to a delivery provider, and its channel. */
const TRANSPORTS: Record<string, string> = {
  'apps/hoa/src/lib/email.ts': 'resend (sendEmail, sendEmailBatch)',
  'apps/hoa/src/lib/sms.ts': 'vonage (sendSms)',
  'packages/jobs/src/web-push.ts': 'web-push (sendPushToUsers)',
  'apps/marketing/src/app/demo/actions.ts': 'resend (demo request to internal inbox)',
}

/**
 * Internal, owner-only notifications that deliberately skip the guard. Each
 * one must take its recipients from a single named env var and nowhere
 * else; the behavioural proof is in the test file named alongside. Adding
 * an entry here is a reviewed decision, never a way round a failing test
 * for resident mail.
 */
const UNGUARDED_INTERNAL: Record<string, { recipientsEnv: string; provedBy: string }> = {
  'scripts/release-notes/lib/send.ts': {
    recipientsEnv: 'RELEASE_NOTES_TO',
    provedBy: 'scripts/release-notes/release-notes.test.ts',
  },
}

/** The Gmail transport: send.ts owns the HTTP call, mailbox-send guards it. */
const GMAIL_SENDER = 'packages/mailbox/src/send.ts'
const GMAIL_CALLERS = ['packages/jobs/src/mailbox-send.ts']

const PROVIDER_IMPORT =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"](resend|@vonage\/[^'"]+|vonage|nexmo|web-push|twilio|nodemailer|@sendgrid\/[^'"]+|postmark|mailgun[^'"]*|@aws-sdk\/client-(?:ses|sesv2|sns|pinpoint)|firebase-admin)['"]/

const RAW_ENDPOINT =
  /gmail\.googleapis\.com\/(?:upload\/)?gmail\/v1\/users\/[^'"`]*\/messages\/send|graph\.microsoft\.com\/[^'"`]*sendMail|api\.resend\.com|rest\.nexmo\.com|api\.nexmo\.com|api\.twilio\.com/

const CALLS_GUARD = /\bguardRecipients\s*\(/
const IMPORTS_GUARD = /['"]@homeowner-portal\/observability\/outbound-guard['"]|['"]\.\/outbound-guard['"]/

describe('outbound ratchet', () => {
  it('scanned a real tree (guards against a broken walk passing vacuously)', () => {
    expect(sources.size).toBeGreaterThan(200)
    for (const file of [...Object.keys(TRANSPORTS), ...Object.keys(UNGUARDED_INTERNAL), GMAIL_SENDER, ...GMAIL_CALLERS]) {
      expect(sources.has(file), `${file} is listed but does not exist`).toBe(true)
    }
  })

  it('provider SDKs are imported only by the known transport modules', () => {
    const offenders = [...sources]
      .filter(([file, src]) => PROVIDER_IMPORT.test(src) && !(file in TRANSPORTS))
      .map(([file, src]) => `${file} imports ${src.match(PROVIDER_IMPORT)?.[1]}`)
    expect(
      offenders,
      'Send through sendEmail/sendEmailBatch/sendSms/sendPushToUsers instead, or add the module to TRANSPORTS and make it call guardRecipients.',
    ).toEqual([])
  })

  it('every transport module still imports a provider (no stale entries)', () => {
    const stale = Object.keys(TRANSPORTS).filter((f) => !PROVIDER_IMPORT.test(sources.get(f) ?? ''))
    expect(stale, 'Remove these from TRANSPORTS').toEqual([])
  })

  it('every transport module imports and calls the outbound guard', () => {
    const unguarded = [...Object.keys(TRANSPORTS), ...GMAIL_CALLERS].filter((f) => {
      const src = sources.get(f) ?? ''
      return !IMPORTS_GUARD.test(src) || !CALLS_GUARD.test(src)
    })
    expect(unguarded).toEqual([])
  })

  it('raw provider HTTP endpoints appear only in the Gmail transport', () => {
    const offenders = [...sources]
      .filter(([file, src]) => file !== GMAIL_SENDER && !(file in UNGUARDED_INTERNAL) && RAW_ENDPOINT.test(src))
      .map(([file]) => file)
    expect(offenders).toEqual([])
  })

  it('each unguarded internal sender still sends, reads recipients from its env var, and has its proof test', () => {
    const problems = Object.entries(UNGUARDED_INTERNAL).flatMap(([file, rule]) => {
      const src = sources.get(file) ?? ''
      const out: string[] = []
      if (!RAW_ENDPOINT.test(src) && !PROVIDER_IMPORT.test(src)) out.push(`${file} no longer sends (remove it)`)
      if (!src.includes(rule.recipientsEnv)) out.push(`${file} does not read ${rule.recipientsEnv}`)
      let proof = ''
      try {
        proof = readFileSync(path.join(repoRoot, rule.provedBy), 'utf8')
      } catch {
        out.push(`${rule.provedBy} is missing`)
      }
      if (proof && !proof.includes(rule.recipientsEnv)) out.push(`${rule.provedBy} does not test ${rule.recipientsEnv}`)
      return out
    })
    expect(problems).toEqual([])
  })

  it('the Gmail send (sendReply) is called only from the guarded mailbox-send job', () => {
    const callers = [...sources]
      .filter(([file, src]) => file !== GMAIL_SENDER && /\bsendReply\s*\(/.test(src))
      .map(([file]) => file)
    expect(callers.sort()).toEqual([...GMAIL_CALLERS].sort())
  })

  it('in each guarded module, the guard runs before the provider call', () => {
    const PROVIDER_CALL: Record<string, RegExp> = {
      'apps/hoa/src/lib/email.ts': /\.emails\.send\(/,
      'apps/hoa/src/lib/sms.ts': /\.messages\.send\(/, // BL-146b: Messages API
      'packages/jobs/src/web-push.ts': /\.sendNotification\(/,
      'apps/marketing/src/app/demo/actions.ts': /\.emails\.send\(/,
      'packages/jobs/src/mailbox-send.ts': /\bsendReply\s*\(/,
    }
    const wrongOrder = Object.entries(PROVIDER_CALL).filter(([file, call]) => {
      const src = sources.get(file) ?? ''
      const guardAt = src.search(CALLS_GUARD)
      const callAt = src.search(call)
      return guardAt < 0 || callAt < 0 || guardAt > callAt
    })
    expect(wrongOrder.map(([f]) => f)).toEqual([])
  })
})
