// Send a rendered release note through Resend's HTTP API.
//
// This is an internal notification to the account owner, so it does NOT go
// through apps/hoa's sendEmail() / the resident outbound guard
// (packages/observability/src/outbound-guard.ts). In exchange it has its own
// hard rule: recipients come from RELEASE_NOTES_TO and nowhere else. A note
// file, a payload or a CLI flag cannot add or change a recipient.
//
// Logs carry counts and ids only — never an address (no PII in output).

import type { EmailPayload } from './build'

export const RESEND_ENDPOINT = 'https://api.resend.com/emails'

export interface SendEnv {
  apiKey: string
  from: string
  to: string[]
}

export class ConfigError extends Error {}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/
/** `addr@x.y` or `Display Name <addr@x.y>`. */
const FROM = /^(?:[^<>\r\n]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/

/**
 * Reads and validates the three settings. RELEASE_NOTES_FROM falls back to
 * EMAIL_FROM (the app's sender convention, e.g.
 * "HomeownerHub <noreply@homeownerledger.com>") when that is in the env.
 * Throws ConfigError naming every missing or malformed variable.
 */
export function readSendEnv(env: NodeJS.ProcessEnv): SendEnv {
  const problems: string[] = []
  const apiKey = env.RESEND_API_KEY?.trim() ?? ''
  if (!apiKey) problems.push('RESEND_API_KEY is not set')
  const from = (env.RELEASE_NOTES_FROM?.trim() || env.EMAIL_FROM?.trim()) ?? ''
  if (!from) problems.push('RELEASE_NOTES_FROM is not set (and no EMAIL_FROM to fall back to)')
  else if (!FROM.test(from)) problems.push('RELEASE_NOTES_FROM is not a valid sender ("Name <addr@domain>" or "addr@domain")')
  const to = (env.RELEASE_NOTES_TO ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!to.length) problems.push('RELEASE_NOTES_TO is not set (comma-separated addresses)')
  const bad = to.filter((t) => !EMAIL.test(t)).length
  if (bad) problems.push(`RELEASE_NOTES_TO has ${bad} malformed address${bad === 1 ? '' : 'es'}`)
  if (problems.length) throw new ConfigError(`Refusing to send release notes:\n  - ${problems.join('\n  - ')}`)
  return { apiKey, from, to }
}

export interface SendResult {
  id: string | null
  recipients: number
}

/**
 * POSTs the payload. Only content fields are read from `payload`; any
 * `to`/`cc`/`bcc`/`from`/`reply_to` it might carry is ignored.
 */
export async function sendViaResend(
  payload: EmailPayload,
  env: SendEnv,
  opts: { fetch?: typeof fetch; idempotencyKey?: string } = {},
): Promise<SendResult> {
  const doFetch = opts.fetch ?? fetch
  const body = {
    from: env.from,
    to: env.to,
    subject: payload.subject,
    html: payload.html,
    text: payload.text,
    attachments: payload.attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      content_type: a.content_type,
      content_id: a.content_id,
    })),
    tags: [{ name: 'category', value: 'release_notes' }],
  }
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.apiKey}`,
    'Content-Type': 'application/json',
  }
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey
  const res = await doFetch(RESEND_ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) {
    // Status and Resend's error *name* only: its message can echo an address.
    let name = 'unknown'
    try {
      const j = (await res.json()) as { name?: string }
      if (typeof j.name === 'string') name = j.name
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`Resend rejected the release-note email: HTTP ${res.status} (${name})`)
  }
  let id: string | null = null
  try {
    const j = (await res.json()) as { id?: string }
    id = typeof j.id === 'string' ? j.id : null
  } catch {
    /* empty body */
  }
  return { id, recipients: env.to.length }
}
