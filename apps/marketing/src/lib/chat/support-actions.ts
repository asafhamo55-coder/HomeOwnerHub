'use server'

// "Talk to a person": delivers the visitor's question to support through the
// same Resend + outbound-guard path the /demo form uses (app/demo/actions.ts).
// The visitor is never emailed: replyTo is set so support can answer. Nothing
// is stored here and the message body is never logged.

import { z } from 'zod'
import { Resend } from 'resend'
import { guardRecipients } from '@homeowner-portal/observability/outbound-guard'

const SUPPORT_TO = 'support@homeownerledger.com'

const Schema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120),
  email: z.string().trim().email("That email doesn't look right.").max(200),
  question: z.string().trim().min(5, 'Please tell us what you need help with.').max(2000),
  role: z.enum(['board', 'homeowner', 'looking']),
  // Honeypot: bots fill every visible field.
  website: z.string().max(0).optional(),
})

export type SupportRequestState =
  | { status: 'sent' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }

const ROLE_LABEL = { board: 'Board member', homeowner: 'Homeowner', looking: 'Just looking' } as const

export async function submitSupportRequest(input: Record<string, string>): Promise<SupportRequestState> {
  const parsed = Schema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { status: 'error', message: 'Please check the form.', fieldErrors }
  }
  const data = parsed.data
  if (data.website) return { status: 'sent' }

  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.SUPPORT_INBOX_EMAIL || SUPPORT_TO
  const from =
    process.env.DEMO_FROM_EMAIL || process.env.EMAIL_FROM || 'HomeownerHub <support@homeownerledger.com>'
  const copyFallback = `We could not send that. Please email ${SUPPORT_TO} directly.`

  if (!apiKey) {
    // Same rule as /demo: in production a missing key must not look like success.
    if (process.env.VERCEL_ENV === 'production') {
      console.error('[support-request] RESEND_API_KEY not set in production; not delivered')
      return { status: 'error', message: copyFallback }
    }
    console.log('[support-request] RESEND_API_KEY not set, nothing sent')
    return { status: 'sent' }
  }

  if (guardRecipients('email', [to], (r) => r, { ref: 'support-request' }).allowed.length === 0) {
    return { status: 'sent' }
  }

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: data.email,
      subject: `Website chat: question from ${ROLE_LABEL[data.role].toLowerCase()}`,
      text: [
        'A visitor asked to talk to a person from the website chat.',
        '',
        `Name:  ${data.name}`,
        `Email: ${data.email}`,
        `Role:  ${ROLE_LABEL[data.role]}`,
        '',
        data.question,
      ].join('\n'),
    })
    if (error) {
      console.error('[support-request] Resend error')
      return { status: 'error', message: copyFallback }
    }
    return { status: 'sent' }
  } catch {
    console.error('[support-request] unexpected error')
    return { status: 'error', message: copyFallback }
  }
}
