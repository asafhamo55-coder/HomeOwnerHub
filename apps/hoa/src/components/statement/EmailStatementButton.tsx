'use client'

import { Mail } from 'lucide-react'
import { Button, ConfirmDialog, useToast } from '@homeowner-portal/ui'
import { emailStatementToOwner } from '@/lib/resident-notify/statement-actions'

/**
 * "Email to owner" on the board statement page. The dialog shows only a
 * masked address (j***@example.com) and the period; the server resolves the
 * real recipient itself.
 */
export function EmailStatementButton({
  propertyId,
  from,
  to,
  periodLabel,
  maskedRecipients,
}: {
  propertyId: string
  from: string
  to: string
  periodLabel: string
  maskedRecipients: string[]
}) {
  const toast = useToast()
  const hasEmail = maskedRecipients.length > 0

  async function send() {
    const r = await emailStatementToOwner({ propertyId, from, to })
    if (r.ok) {
      toast({ tone: r.status === 'sent' ? 'success' : 'info', title: r.status === 'sent' ? 'Statement sent' : 'Statement held', message: r.message })
      return
    }
    toast({ tone: 'error', title: 'Statement not sent', message: r.error })
  }

  return (
    <ConfirmDialog
      title="Email this statement to the owner?"
      description={
        hasEmail ? (
          <>
            It goes to {maskedRecipients.join(', ')} and covers {periodLabel}. It shows the same figures as this page and
            links to the owner’s portal. Nothing is posted to the ledger.
          </>
        ) : (
          <>There is no email address on file for this home’s owner, so nothing can be sent.</>
        )
      }
      confirmLabel="Send statement"
      onConfirm={send}
      trigger={
        <Button type="button" variant="secondary" icon={<Mail aria-hidden />}>
          Email to owner
        </Button>
      }
    />
  )
}
