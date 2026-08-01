'use client'

import { useRouter } from 'next/navigation'
import { TwoClickDelete } from '@/components/TwoClickDelete'
import { disconnectMailbox } from './actions'

interface Props {
  accountId: string
}

/**
 * Soft-disconnects the connected mailbox. Uses the shared two-click
 * confirm primitive (see TwoClickDelete.tsx) rather than useConfirm() —
 * this codebase moved off the modal confirm for destructive actions after
 * it was found to render invisibly in some browser/CSS combinations and
 * silently swallow the action.
 *
 * disconnectMailbox soft-deletes the ACCOUNT (sets disconnected_at,
 * leaving the row and all ingested mail in place, so calling it again for
 * the same address is safe and reversible by reconnecting) but HARD-
 * deletes the credential and revokes the Google-side grant. Reconnecting
 * therefore goes through the full consent screen again, which is the
 * correct meaning of "Disconnect" — see the doc comment on the action.
 */
export function DisconnectMailboxButton({ accountId }: Props) {
  const router = useRouter()

  async function handleDelete(): Promise<{ ok: true } | { ok: false; error: string }> {
    const formData = new FormData()
    formData.set('accountId', accountId)
    const result = await disconnectMailbox({}, formData)
    if (result.error) return { ok: false, error: result.error }
    return { ok: true }
  }

  return (
    <TwoClickDelete
      onDelete={handleDelete}
      successMessage="Mailbox disconnected and Google access revoked. Imported mail is still here."
      onAfterDelete={() => router.refresh()}
      label="Disconnect mailbox"
      variant="ghost"
    />
  )
}
