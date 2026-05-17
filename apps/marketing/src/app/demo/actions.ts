'use server'

import { z } from 'zod'
import { Resend } from 'resend'

const DemoRequestSchema = z.object({
  name: z.string().trim().min(2, 'Please enter your name.').max(120),
  email: z.string().trim().email('That email doesn\'t look right.').max(200),
  hoa: z.string().trim().min(2, 'Please enter your HOA or community name.').max(200),
  // Honeypot — must be empty. Bots fill every visible field.
  website: z.string().max(0, 'Spam detected.').optional(),
})

export type DemoRequestState =
  | { status: 'idle' }
  | { status: 'success' }
  | { status: 'error'; message: string; fieldErrors?: Record<string, string> }

export async function submitDemoRequest(
  _prev: DemoRequestState,
  formData: FormData,
): Promise<DemoRequestState> {
  const raw = Object.fromEntries(formData.entries())
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
    }
  }

  const data = parsed.data

  // Silently drop honeypot hits — don't tell bots they were caught.
  if (data.website && data.website.length > 0) {
    return { status: 'success' }
  }

  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.DEMO_INBOX_EMAIL || 'asafhamo55@gmail.com'
  const from = process.env.DEMO_FROM_EMAIL || 'Ledger <demo@ledger.ai>'

  const summary = `
New demo request — Ledger
================================

Name:    ${data.name}
Email:   ${data.email}
HOA:     ${data.hoa}

—
Submitted at ${new Date().toISOString()}
`.trim()

  if (!apiKey) {
    // Dev mode: no Resend key configured. Log to the server console so the
    // submission is visible during local development, then succeed.
    console.log('[demo-request] RESEND_API_KEY not set — logging only')
    console.log(summary)
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
        message: 'We couldn\'t send your request. Please email demo@ledger.ai directly.',
      }
    }

    return { status: 'success' }
  } catch (err) {
    console.error('[demo-request] unexpected error:', err)
    return {
      status: 'error',
      message: 'Something went wrong. Please email demo@ledger.ai directly.',
    }
  }
}
