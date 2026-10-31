'use client'

import { useState } from 'react'
import { Alert, Button } from '@homeowner-portal/ui'
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from '@/components/auth/auth-errors-shared'
import { emailProblem } from '@/components/auth/auth-fields'
import { sendSignInLink } from '@/components/auth/send-sign-in-link'
import type { LinkErrorCode } from './link-error'

/**
 * Shown on /login when an email link did not work: expired, already used, or
 * opened on a different device than the one that asked for it. Plain words,
 * one button, and a way to reach a person.
 */
export function LinkErrorNotice({
  code,
  email,
  redirectTo,
}: {
  code: LinkErrorCode
  /** The email typed in the form below; the button sends to it. */
  email: string
  redirectTo?: string
}) {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [problem, setProblem] = useState<string | null>(null)

  async function resend() {
    const bad = emailProblem(email)
    if (bad) {
      setProblem('Type your email in the box below first, then press this button again.')
      return
    }
    setProblem(null)
    setState('sending')
    const failure = await sendSignInLink(email, redirectTo)
    if (failure) {
      setProblem(failure)
      setState('idle')
      return
    }
    setState('sent')
  }

  if (state === 'sent') {
    return (
      <Alert variant="success" title="Check your email" className="mb-5">
        We sent a new sign-in link to {email.trim()}. Open it on this phone or computer. Nothing after a
        minute? Check your spam folder.
      </Alert>
    )
  }

  return (
    <Alert
      variant="warning"
      title="This link has expired or was already used."
      className="mb-5"
      actions={
        <Button type="button" size="md" onClick={resend} loading={state === 'sending'}>
          Send me a new link
        </Button>
      }
    >
      <p>
        Type your email below and we’ll send you a new sign-in link. Or ask your board to send a new
        invite.
      </p>
      {code === 'exchange_failed' ? (
        <p className="mt-2">
          Opened the email on a different phone or computer? Links only work on the device where you
          asked for them.
        </p>
      ) : null}
      {problem ? (
        <p className="mt-2 font-medium text-danger" role="alert">
          {problem}
        </p>
      ) : null}
      <p className="mt-2">
        Need help?{' '}
        <a href={SUPPORT_MAILTO} className="font-medium text-primary underline underline-offset-2">
          Email {SUPPORT_EMAIL}
        </a>
      </p>
    </Alert>
  )
}
