/**
 * Access-token custody for mailbox sync.
 *
 * Tokens live in mailbox_account_secrets, which has RLS enabled and NO
 * permissive policy — only the service role can touch it. Everything here
 * therefore uses createAdminClient().
 *
 * Refresh happens 5 minutes before expiry rather than on failure, so a
 * sync run never burns a Gmail call discovering its token is dead.
 */

import { createAdminClient } from '@homeowner-portal/db'
import {
  currentKeyVersion,
  decryptToken,
  encryptToken,
  MailboxAuthError,
  refreshAccessToken,
} from '@homeowner-portal/mailbox'
import { logDbError } from './db-error'

type Db = ReturnType<typeof createAdminClient>

const REFRESH_MARGIN_MS = 5 * 60 * 1000

export async function getAccessTokenFor(db: Db, accountId: string): Promise<string> {
  const { data: secret, error } = await db
    .from('mailbox_account_secrets')
    .select('refresh_token_enc, access_token_enc, token_expires_at')
    .eq('mailbox_account_id', accountId)
    .maybeSingle()

  if (error) {
    // A soft read failure (RLS misconfiguration, connection-pool
    // exhaustion, a transient Postgres blip) is NOT evidence the
    // credentials are gone — it is indistinguishable, at this point, from
    // any other transient failure. Throwing MailboxAuthError here would
    // send the caller to markAuthFailed, which sets
    // sync_status='auth_failed' — and mailbox-sync.ts's account-listing
    // query filters `.neq('sync_status', 'auth_failed')`, so a single DB
    // blip would permanently drop a working mailbox from every future run
    // until a human notices and reconnects. A generic Error is retryable
    // and leaves sync_status untouched. Only a clean read that genuinely
    // finds zero rows (below) may become a MailboxAuthError — that really
    // does mean the credentials are gone.
    logDbError('getAccessTokenFor', 'mailbox_account_secrets', { accountId }, error)
    throw new Error(
      `getAccessTokenFor: failed to read credentials for mailbox account ${accountId}: ${error.message}`,
    )
  }

  if (!secret) {
    throw new MailboxAuthError(`No stored credentials for mailbox account ${accountId}.`)
  }

  const stillValid =
    secret.access_token_enc &&
    secret.token_expires_at &&
    new Date(secret.token_expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS

  if (stillValid) return decryptToken(secret.access_token_enc as string)

  const tokens = await refreshAccessToken(decryptToken(secret.refresh_token_enc))

  const { error: updateError } = await db
    .from('mailbox_account_secrets')
    .update({
      access_token_enc: encryptToken(tokens.accessToken),
      // Google may rotate the refresh token; persist it when it does.
      refresh_token_enc: tokens.refreshToken
        ? encryptToken(tokens.refreshToken)
        : secret.refresh_token_enc,
      token_expires_at: tokens.expiresAt,
      key_version: currentKeyVersion(),
      updated_at: new Date().toISOString(),
    })
    .eq('mailbox_account_id', accountId)

  if (updateError) {
    // The refreshed token itself is good and would otherwise be handed
    // back to the caller below, but if the persist failed the next run
    // reads the stale pre-refresh row and has to refresh all over again.
    // That is wasted work, not silent data loss — but it should be
    // visible and retried rather than swallowed, so this throws.
    logDbError('getAccessTokenFor', 'mailbox_account_secrets', { accountId }, updateError)
    throw new Error(
      `getAccessTokenFor: failed to persist refreshed token for mailbox account ${accountId}: ${updateError.message}`,
    )
  }

  return tokens.accessToken
}

/**
 * Credentials are dead. Stop retrying — hammering Google's token endpoint
 * with a revoked grant is how an OAuth client gets flagged — and make the
 * failure visible so someone reconnects.
 *
 * Judgement call: this runs on an error path — the caller already caught
 * a MailboxAuthError and is about to log it. If THIS write also fails,
 * throwing would replace that original, more informative auth failure
 * with a less useful "couldn't record the failure" error, so this logs
 * loudly instead of throwing. The practical effect of a failed write here
 * is that sync_status never actually flips to 'auth_failed', so the
 * account stays in the sync rotation and simply fails the same way again
 * next run — the safer of the two failure modes, and self-correcting the
 * moment the write succeeds.
 */
export async function markAuthFailed(
  db: Db,
  accountId: string,
  message: string,
): Promise<void> {
  const { error } = await db
    .from('mailbox_accounts')
    .update({ sync_status: 'auth_failed', sync_error: message })
    .eq('id', accountId)

  if (error) {
    logDbError('markAuthFailed', 'mailbox_accounts', { accountId }, error)
  }
}
