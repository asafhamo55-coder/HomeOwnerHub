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

type Db = ReturnType<typeof createAdminClient>

const REFRESH_MARGIN_MS = 5 * 60 * 1000

export async function getAccessTokenFor(db: Db, accountId: string): Promise<string> {
  const { data: secret } = await db
    .from('mailbox_account_secrets')
    .select('refresh_token_enc, access_token_enc, token_expires_at')
    .eq('mailbox_account_id', accountId)
    .maybeSingle()

  if (!secret) {
    throw new MailboxAuthError(`No stored credentials for mailbox account ${accountId}.`)
  }

  const stillValid =
    secret.access_token_enc &&
    secret.token_expires_at &&
    new Date(secret.token_expires_at).getTime() - Date.now() > REFRESH_MARGIN_MS

  if (stillValid) return decryptToken(secret.access_token_enc as string)

  const tokens = await refreshAccessToken(decryptToken(secret.refresh_token_enc))

  await db
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

  return tokens.accessToken
}

/**
 * Credentials are dead. Stop retrying — hammering Google's token endpoint
 * with a revoked grant is how an OAuth client gets flagged — and make the
 * failure visible so someone reconnects.
 */
export async function markAuthFailed(
  db: Db,
  accountId: string,
  message: string,
): Promise<void> {
  await db
    .from('mailbox_accounts')
    .update({ sync_status: 'auth_failed', sync_error: message })
    .eq('id', accountId)
}
