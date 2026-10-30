'use server'

import { z } from 'zod'
import { Resend } from 'resend'
import { guardRecipients } from '@homeowner-portal/observability/outbound-guard'

const DemoRequestSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120),
  email: z.string().trim().email('That email doesn\'t look right.').max(200),
  hoa: z.string().trim().min(2, 'Please enter your HOA or community name.').max(200),
  // Optional. A blank field arrives as '' from the browser.
  county: z.string().trim().max(80, 'That county name is too long.').optional(),
  homes: z
    .union([z.literal(''), z.string().trim().regex(/^\d{1,5}$/, 'Enter a whole number, like 120.')])
    .optional(),
  // Honeypot — must be empty. Bots fill every visible field.
  website: z.string().max(0, 'Spam detected.').optional(),
})

export type DemoRequestState =
  | { status: 'idle' }
  | { status: 'success' }
  | {
      status: 'error'
      message: string
      fieldErrors?: Record<string, string>
      // Echo of what the visitor typed (the honeypot is never echoed), so a
      // failed submit does not wipe the form (React resets uncontrolled forms
      // after an action).
      values?: Record<string, string>
    }

const ECHO_FIELDS = ['name', 'email', 'hoa', 'county', 'homes'] as const

function echoValues(raw: Record<string, FormDataEntryValue>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const k of ECHO_FIELDS) {
    const v = raw[k]
    if (typeof v === 'string') out[k] = v.slice(0, 200)
  }
  return out
}

export async function submitDemoRequest(
  _prev: DemoRequestState,
  formData: FormData,
): Promise<DemoRequestState> {
  const raw = Object.fromEntries(formData.entries())
  const values = echoValues(raw)
  const parsed = DemoRequestSchema.safeParse(raw)

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0]
      if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return {
      status: 'error',
      message: 'Please double-check the form.',
      fieldErrors,
      values,
    }
  }

  const data = parsed.data

  // Silently drop honeypot hits — don't tell bots they were caught.
  if (data.website && data.website.length > 0) {
    return { status: 'success' }
  }

  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.DEMO_INBOX_EMAIL || 'asafhamo55@gmail.com'
  const from =
    process.env.DEMO_FROM_EMAIL || process.env.EMAIL_FROM || 'HomeownerHub <support@homeownerledger.com>'

  const summary = `
New demo request — HomeownerHub
================================

Name:    ${data.name}
Email:   ${data.email}
HOA:     ${data.hoa}
County:  ${data.county || 'not given'}
Homes:   ${data.homes || 'not given'}

—
Submitted at ${new Date().toISOString()}
`.trim()

  if (!apiKey) {
    // In production a missing key must not look like success: the request
    // would be lost while the visitor is told it went through (found
    // 2026-10-26: the marketing project had no RESEND_API_KEY).
    if (process.env.VERCEL_ENV === 'production') {
      console.error('[demo-request] RESEND_API_KEY not set in production; request not delivered')
      return {
        status: 'error',
        message: 'We couldn\'t send your request. Please email support@homeownerledger.com directly.',
        values,
      }
    }
    // Dev mode: log to the server console so the submission is visible
    // during local development, then succeed.
    console.log('[demo-request] RESEND_API_KEY not set — logging only')
    console.log(summary)
    return { status: 'success' }
  }

  // Outbound safety guard (BL-004): outside production the internal inbox
  // must be on OUTBOUND_ALLOWLIST too. A blocked request is dropped (the
  // guard logs counts only) and the visitor still sees success.
  if (guardRecipients('email', [to], (r) => r, { ref: 'demo-request' }).allowed.length === 0) {
    return { status: 'success' }
  }

  try {
    const resend = new Resend(apiKey)
    const { error } = await resend.emails.send({
      from,
      to,
      replyTo: data.email,
      subject: `New demo request — ${data.hoa}`,
      text: summary,
    })

    if (error) {
      console.error('[demo-request] Resend error:', error)
      return {
        status: 'error',
        message: 'We couldn\'t send your request. Please email support@homeownerledger.com directly.',
        values,
      }
    }

    return { status: 'success' }
  } catch (err) {
    console.error('[demo-request] unexpected error:', err)
    return {
      status: 'error',
      message: 'Something went wrong. Please email support@homeownerledger.com directly.',
      values,
    }
  }
}
