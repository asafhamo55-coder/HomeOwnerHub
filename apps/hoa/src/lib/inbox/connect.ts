/**
 * Mailbox connect — the OAuth dance.
 *
 * The `state` parameter is a signed payload, not a random nonce looked up
 * in a table. It carries org id, user id, and the return path, and it is
 * HMAC-signed with a short expiry. That gives CSRF protection without a
 * round-trip to Postgres on a path that runs at most a few times per
 * tenant, and it survives the redirect statelessly. Verification uses a
 * timing-safe comparison on the MAC — a naive `===` on an HMAC is a
 * timing oracle.
 *
 * Signed with MAILBOX_TOKEN_KEY — the same secret packages/mailbox/src/
 * crypto.ts uses to encrypt tokens at rest. It is already required,
 * already 32 bytes, and already handled as a secret, so this reuses it
 * rather than introducing a second env var. That does mean the key is
 * now doing double duty (token encryption + state signing).
 *
 * Error handling: every Supabase read/write below destructures `error`
 * and either throws (a soft PostgREST failure returns `{ data: null,
 * error }` rather than throwing, so an unchecked read would silently
 * look like "no rows") — matching the pattern established in
 * apps/hoa/src/lib/inbox/ingest.ts and packages/jobs/src/db-error.ts.
 * A database error here must never be mistaken for an auth failure.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { PostgrestError } from '@supabase/supabase-js'
import { createAdminClient } from '@homeowner-portal/db'
import {
  buildConsentUrl,
  currentKeyVersion,
  encryptToken,
  exchangeCode,
  GmailClient,
  recommendScope,
} from '@homeowner-portal/mailbox'

const STATE_TTL_MS = 10 * 60 * 1000

interface StatePayload {
  orgId: string
  userId: string
  returnTo: string
  issuedAt: number
}

function stateSecret(): string {
  const secret = process.env.MAILBOX_TOKEN_KEY
  if (!secret) throw new Error('MAILBOX_TOKEN_KEY is not set.')
  return secret
}

function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${mac}`
}

function verifyState(state: string): StatePayload {
  const [body, mac] = state.split('.')
  if (!body || !mac) throw new Error('Malformed OAuth state.')

  const expected = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('OAuth state signature mismatch.')
  }

  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload
  if (Date.now() - payload.issuedAt > STATE_TTL_MS) {
    throw new Error('OAuth state expired — please start the connection again.')
  }
  return payload
}

/**
 * Local rather than shared — matches the precedent in ingest.ts and
 * match.ts, both of which define their own copy instead of importing
 * packages/jobs/src/db-error.ts (a jobs-package internal). Never logs
 * `.details`: on a PostgrestError it can carry row values, which may
 * include resident PII.
 */
function logDbError(
  fn: string,
  table: string,
  context: Record<string, string | null>,
  error: PostgrestError,
): void {
  console.error(`${fn}: query on "${table}" failed`, {
    ...context,
    code: error.code,
    message: error.message,
  })
}

export function startConnect(orgId: string, userId: string, returnTo: string): string {
  return buildConsentUrl({
    state: signState({ orgId, userId, returnTo, issuedAt: Date.now() }),
  })
}

export async function completeConnect(
  code: string,
  state: string,
): Promise<{ accountId: string; orgId: string; returnTo: string }> {
  const { orgId, userId, returnTo } = verifyState(state)

  const tokens = await exchangeCode(code)
  if (!tokens.refreshToken) {
    // Without a refresh token the connection dies in about an hour. This
    // happens when prompt=consent was omitted or the user previously
    // authorized and Google suppressed it.
    throw new Error(
      'Google did not return a refresh token. Remove HomeownerHub at ' +
        'myaccount.google.com/permissions and connect again.',
    )
  }

  const client = new GmailClient(tokens.accessToken)
  const profile = await client.getProfile()
  const sendAs = await client.listSendAs().catch(() => [])
  const recommended = recommendScope(sendAs, profile.emailAddress)

  const db = createAdminClient()

  // Reconnecting the same address reuses the row so ingested history and
  // its threads survive — never create a second account row for a
  // reconnect.
  const { data: existing, error: lookupError } = await db
    .from('mailbox_accounts')
    .select('id')
    .eq('organization_id', orgId)
    .eq('email_address', profile.emailAddress)
    .is('disconnected_at', null)
    .maybeSingle()

  if (lookupError) {
    logDbError('completeConnect', 'mailbox_accounts', { orgId }, lookupError)
    throw new Error(
      `completeConnect: failed to check for an existing mailbox connection: ${lookupError.message}`,
    )
  }

  let accountId: string

  if (existing) {
    accountId = existing.id
    const { error: updateError } = await db
      .from('mailbox_accounts')
      .update({ sync_status: 'ok', sync_error: null, connected_by: userId })
      .eq('id', accountId)

    if (updateError) {
      logDbError('completeConnect', 'mailbox_accounts', { orgId, accountId }, updateError)
      throw new Error(
        `completeConnect: failed to reactivate mailbox account ${accountId}: ${updateError.message}`,
      )
    }
  } else {
    const { data: created, error: insertError } = await db
      .from('mailbox_accounts')
      .insert({
        organization_id: orgId,
        provider: 'gmail',
        email_address: profile.emailAddress,
        display_name: profile.emailAddress,
        scope_mode: recommended.scopeMode,
        scope_value: recommended.scopeValue,
        // Deliberately NOT set to profile.historyId. Leaving the cursor
        // null makes the first sync take the dated-bootstrap path, which
        // picks up recent mail instead of only what arrives from now on.
        sync_cursor: null,
        connected_by: userId,
      })
      .select('id')
      .single()

    if (insertError) {
      logDbError('completeConnect', 'mailbox_accounts', { orgId }, insertError)
      throw new Error(
        `completeConnect: could not save the mailbox connection: ${insertError.message}`,
      )
    }
    if (!created) {
      throw new Error('completeConnect: mailbox account insert returned no row.')
    }
    accountId = created.id
  }

  const { error: secretsError } = await db.from('mailbox_account_secrets').upsert({
    mailbox_account_id: accountId,
    refresh_token_enc: encryptToken(tokens.refreshToken),
    access_token_enc: encryptToken(tokens.accessToken),
    token_expires_at: tokens.expiresAt,
    key_version: currentKeyVersion(),
    updated_at: new Date().toISOString(),
  })

  if (secretsError) {
    logDbError('completeConnect', 'mailbox_account_secrets', { orgId, accountId }, secretsError)
    throw new Error(
      `completeConnect: failed to store mailbox credentials for account ${accountId}: ${secretsError.message}`,
    )
  }

  return { accountId, orgId, returnTo }
}

/** Available send-as aliases and labels, for the scope picker. */
export async function loadScopeOptions(accountId: string): Promise<{
  addresses: string[]
  labels: Array<{ id: string; name: string }>
}> {
  const db = createAdminClient()
  const { getAccessTokenFor } = await import('@homeowner-portal/jobs/mailbox-tokens')
  const client = new GmailClient(await getAccessTokenFor(db, accountId))

  const [sendAs, labels] = await Promise.all([
    client.listSendAs().catch(() => []),
    client.listLabels().catch(() => []),
  ])

  return {
    addresses: sendAs.map((s) => s.sendAsEmail),
    labels: labels
      .filter((l) => l.type === 'user')
      .map((l) => ({ id: l.id, name: l.name })),
  }
}
