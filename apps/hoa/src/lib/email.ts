// Resend wrapper for transactional email.
//
// Env vars:
//   RESEND_API_KEY        - your Resend API key
//   EMAIL_FROM            - the verified sender address, e.g. "HomeownerHub <hello@yourdomain.com>"
//                           Its DISPLAY NAME is a fallback: callers that pass
//                           `senderName` send as the community instead (see
//                           email/sender-name.ts). The address is always the
//                           one here, because that domain is Resend-verified.
//   NEXT_PUBLIC_APP_URL   - the public base URL used to build links in email bodies
//
// If RESEND_API_KEY is unset we no-op and log instead — keeps dev/preview
// builds from failing when the key isn't configured yet.

import { Resend } from 'resend'
import { formatFrom } from './email/sender-name'

let _client: Resend | null = null

function getClient(): Resend | null {
  if (_client) return _client
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  _client = new Resend(key)
  return _client
}

export interface SendEmailInput {
  to: string
  subject: string
  html: string
  text?: string
  /**
   * Display name for the From header, e.g. "Madison Park HOA". Omit for
   * platform mail that really is from HomeownerHub — omitting leaves
   * EMAIL_FROM exactly as configured.
   */
  senderName?: string | null
}

export async function sendEmail(input: SendEmailInput): Promise<
  | { ok: true; messageId: string | null }
  | { ok: false; error: string }
> {
  const envFrom = process.env.EMAIL_FROM
  if (!envFrom) {
    return { ok: false, error: 'EMAIL_FROM is not configured.' }
  }
  const from = formatFrom(envFrom, input.senderName)
  const client = getClient()
  if (!client) {
    // No key configured — log so a developer can still trace the flow
    // without burning a real Resend send. NOT for prod.
    console.warn('[email] RESEND_API_KEY missing; skipping send', {
      to: input.to,
      subject: input.subject,
    })
    return { ok: true, messageId: null }
  }

  const result = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  })

  if (result.error) {
    return { ok: false, error: result.error.message ?? 'Resend send failed.' }
  }
  return { ok: true, messageId: result.data?.id ?? null }
}

export function appUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`
}
