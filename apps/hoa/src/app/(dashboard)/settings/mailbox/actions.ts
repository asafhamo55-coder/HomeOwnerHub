'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@homeowner-portal/db'
import { decryptToken, revokeToken } from '@homeowner-portal/mailbox'
import { requireBoardOrAdmin } from '@/lib/auth'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ScopeSchema } from './scopeSchema'

export interface MailboxActionState {
  error?: string
  ok?: boolean
}

/**
 * Both actions below gate on `requireBoardOrAdmin()` rather than
 * `getCurrentOrg()` alone (amended post-review — final branch review,
 * Fix 5). RLS does backstop them, but on the user-bound client a resident
 * POSTing straight at the action got a zero-row update reported as
 * `{ ok: true }` — a lying success, and the only surface in this feature
 * that behaved that way. `requireBoardOrAdmin()` redirects rather than
 * returning, matching lib/inbox/actions.ts and the inbox routes.
 *
 * `disconnectMailbox` additionally needs the service-role client:
 * `mailbox_account_secrets` has RLS enabled with NO policy at all
 * (migration 0029), so a delete issued on the user-bound client would
 * match zero rows and report success while the credential stayed put.
 */

export async function updateScope(
  _prev: MailboxActionState,
  formData: FormData,
): Promise<MailboxActionState> {
  const { org } = await requireBoardOrAdmin()

  const parsed = ScopeSchema.safeParse({
    accountId: formData.get('accountId'),
    scopeMode: formData.get('scopeMode'),
    scopeValue: formData.get('scopeValue') ?? undefined,
  })
  // Fail closed. ScopeSchema (./scopeSchema.ts) enforces two things
  // together, both required before this is ever persisted: (1) address
  // and label modes are meaningless without a value — buildScopeQuery
  // (@homeowner-portal/mailbox) treats an EMPTY value for those modes as
  // "no restricting clause", which would fetch everything, so a missing
  // value is rejected here rather than silently becoming unrestricted;
  // and (2) the value's SHAPE must match the selected mode (a single
  // email address for 'address', a `[A-Za-z0-9_-]+` token for 'label') —
  // this is what stops a stale value from a previous mode selection (or a
  // hand-crafted submission) from being saved with a mode it doesn't
  // match, which would otherwise only surface later as a thrown error
  // inside a sync. Trimming happens inside the schema so a
  // whitespace-only value can't slip past either check.
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? 'Invalid scope selection.'
    return { error: message }
  }

  const { accountId, scopeMode, scopeValue } = parsed.data

  const supabase = await getSupabaseServerClient()
  const { error } = await supabase
    .from('mailbox_accounts')
    .update({ scope_mode: scopeMode, scope_value: scopeValue ?? null })
    .eq('id', accountId)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/settings/mailbox')
  revalidatePath('/onboarding/setup')
  return { ok: true }
}

/**
 * Disconnect: soft-delete the ACCOUNT, hard-delete the CREDENTIAL, and
 * tell Google.
 *
 * The soft delete of the account row is deliberate and unchanged —
 * ingested mail and its threads stay in place, because the HOA's
 * correspondence record must not vanish because someone unlinked Gmail.
 * The unique index on mailbox_accounts is partial (WHERE disconnected_at
 * IS NULL), so stamping `disconnected_at` correctly frees the address up
 * for a future reconnect without deleting anything.
 *
 * The credential is a different matter (amended post-review — final
 * branch review, Fix 3). Previously this function stamped
 * `disconnected_at` and stopped: nothing in the repo ever deleted from
 * `mailbox_account_secrets`, and nothing ever called Google's revoke
 * endpoint. An HOA that clicked Disconnect believed access was removed,
 * while the encrypted refresh token — which migration 0029's own comment
 * describes as granting standing access to an HOA's entire mailbox —
 * persisted indefinitely and the Google-side grant stayed live. Both are
 * now torn down.
 *
 * Order is load-bearing:
 *   1. Ownership check on the USER-bound client, so RLS applies before
 *      anything reaches the service-role client below.
 *   2. Best-effort revoke at Google. Wrapped: a Google outage must never
 *      leave a board unable to disconnect, so a failure here is logged
 *      and the disconnect continues. Our copy of the token is deleted
 *      either way, which is the part we actually control.
 *   3. DELETE the secret row. This is NOT best-effort — it is the whole
 *      point — so a failure returns an error and leaves the account
 *      connected rather than reporting a disconnect that didn't happen.
 *   4. Only then stamp `disconnected_at`. If THIS fails, the credential
 *      is already gone, so the next sync run hits MailboxAuthError and
 *      flips the account to `auth_failed` — a loud, visible state the
 *      board can act on, not a silent one.
 */
export async function disconnectMailbox(
  _prev: MailboxActionState,
  formData: FormData,
): Promise<MailboxActionState> {
  const { org } = await requireBoardOrAdmin()

  const parsedAccountId = z.string().uuid().safeParse(formData.get('accountId'))
  if (!parsedAccountId.success) return { error: 'Invalid account.' }

  const supabase = await getSupabaseServerClient()

  const { data: account, error: lookupError } = await supabase
    .from('mailbox_accounts')
    .select('id')
    .eq('id', parsedAccountId.data)
    .eq('organization_id', org.id)
    .maybeSingle()

  if (lookupError) {
    console.error('disconnectMailbox: query on "mailbox_accounts" failed', {
      orgId: org.id,
      code: lookupError.code,
      message: lookupError.message,
    })
    return { error: 'Could not look up that mailbox connection. Please try again.' }
  }
  if (!account) return { error: 'Mailbox account not found.' }

  const admin = createAdminClient()

  const { data: secret, error: secretReadError } = await admin
    .from('mailbox_account_secrets')
    .select('refresh_token_enc')
    .eq('mailbox_account_id', account.id)
    .maybeSingle()

  if (secretReadError) {
    // Not fatal: a failed READ does not stop the DELETE below from
    // removing the row, it only means we could not attempt the Google-side
    // revoke. Log it and carry on rather than blocking the disconnect.
    console.error('disconnectMailbox: query on "mailbox_account_secrets" failed', {
      accountId: account.id,
      code: secretReadError.code,
      message: secretReadError.message,
    })
  }

  if (secret?.refresh_token_enc) {
    try {
      // decryptToken can itself throw (e.g. a rotated MAILBOX_TOKEN_KEY),
      // which is exactly as non-fatal as a Google outage — hence inside
      // the same try.
      await revokeToken(decryptToken(secret.refresh_token_enc))
    } catch (error) {
      console.error('disconnectMailbox: Google token revocation failed, continuing', {
        accountId: account.id,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const { error: secretDeleteError } = await admin
    .from('mailbox_account_secrets')
    .delete()
    .eq('mailbox_account_id', account.id)

  if (secretDeleteError) {
    console.error('disconnectMailbox: delete on "mailbox_account_secrets" failed', {
      accountId: account.id,
      code: secretDeleteError.code,
      message: secretDeleteError.message,
    })
    return {
      error:
        'Could not remove the stored Google credential, so the mailbox was left ' +
        'connected. Please try again — or remove HomeownerHub at ' +
        'myaccount.google.com/permissions.',
    }
  }

  const { error } = await supabase
    .from('mailbox_accounts')
    .update({ disconnected_at: new Date().toISOString() })
    .eq('id', account.id)
    .eq('organization_id', org.id)

  if (error) return { error: error.message }

  revalidatePath('/settings/mailbox')
  revalidatePath('/onboarding/setup')
  return { ok: true }
}
