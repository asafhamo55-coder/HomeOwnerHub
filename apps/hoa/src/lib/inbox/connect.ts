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
  revokeToken,
} from '@homeowner-portal/mailbox'

const STATE_TTL_MS = 10 * 60 * 1000

/** Default landing page when `returnTo` is missing or fails validation. */
export const DEFAULT_RETURN_TO = '/settings/mailbox'

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

/**
 * Reduce an untrusted `returnTo` candidate to a same-origin path, or fall
 * back to `DEFAULT_RETURN_TO`.
 *
 * `new URL(candidate, base)` ignores `base` whenever `candidate` is
 * already an absolute URL — including protocol-relative forms like
 * `//evil.com`, which browsers resolve using the *current* protocol. A
 * value that starts with a single `/` and nothing else suspicious is
 * the only shape trusted to stay on this origin, so anything else is
 * rejected outright rather than "cleaned up" into something that looks
 * safe but might not be (e.g. stripping a leading slash from `//evil.com`
 * still leaves an attacker-controlled host once a browser re-adds it).
 *
 * A prior version of this function checked only the literal string —
 * `startsWith('//')`, `startsWith('/\\')`, `includes('://')` — and was
 * bypassed by `/\t/evil.com`. The WHATWG URL parser (what Node's `URL`
 * runs, which is what `NextResponse.redirect(new URL(...))` uses, and
 * what every browser uses) strips ASCII tab/CR/LF from *anywhere* in the
 * input, unconditionally, before any other parsing step. That single
 * leading slash plus a tab plus another slash looks path-shaped to a
 * literal-string check and passed every one of them, then collapsed to
 * `//evil.com` — a protocol-relative network-path reference — the moment
 * the tab vanished during parsing. Fixed two ways:
 *   1. Reject any candidate containing a raw tab/CR/LF outright, before
 *      any structural check runs. Stripping them ourselves would just
 *      move the same bug one layer up with us as the new source of
 *      truth for "clean" — rejection is the only option that can't be
 *      quietly reinterpreted later.
 *   2. Treat `new URL(candidate, <dummy origin>)` as the authority, not
 *      just the cheap string checks. It uses the exact parser the real
 *      redirect runs, so it cannot disagree with what actually happens
 *      at redirect time the way hand-written string reasoning can.
 *
 * Exported so it can be unit-tested directly and reused by any other
 * redirect-accepting entry point.
 */
export function sanitizeReturnTo(candidate: string | null | undefined): string {
  if (!candidate) return DEFAULT_RETURN_TO

  // Anywhere in the string, not just leading/trailing — this is what the
  // URL parser itself strips unconditionally, and is exactly what let
  // `/\t/evil.com` slip past every anchored check below.
  if (/[\t\r\n]/.test(candidate)) return DEFAULT_RETURN_TO

  // Cheap structural pre-checks. `includes`, not `startsWith`: anchoring
  // these checks to the start of the string is what made the bypass
  // possible in the first place, so a hostile `//` or `/\` is rejected
  // no matter where it appears, not only at position 0.
  if (!candidate.startsWith('/')) return DEFAULT_RETURN_TO
  if (candidate.includes('//')) return DEFAULT_RETURN_TO
  if (candidate.includes('/\\')) return DEFAULT_RETURN_TO
  if (candidate.includes('://')) return DEFAULT_RETURN_TO

  // Authority: resolve with the same parser the real redirect uses, and
  // accept only if the origin survived unchanged. See the function
  // comment above for why this — not the string checks — is the actual
  // source of truth.
  const PLACEHOLDER_ORIGIN = 'https://sanitize-return-to.invalid'
  try {
    const resolved = new URL(candidate, PLACEHOLDER_ORIGIN)
    if (resolved.origin !== PLACEHOLDER_ORIGIN) return DEFAULT_RETURN_TO
  } catch {
    return DEFAULT_RETURN_TO
  }

  return candidate
}

/**
 * Exported beyond this module's natural contract solely so the test file
 * beside it can exercise the signing/verification logic directly — this
 * is security-critical (it gates standing access to an entire HOA
 * mailbox) and deserves direct coverage rather than only the indirect
 * coverage `startConnect`/`completeConnect` would give it.
 */
export function signState(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const mac = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  return `${body}.${mac}`
}

export function verifyState(state: string): StatePayload {
  const parts = state.split('.')
  if (parts.length !== 2) throw new Error('Malformed OAuth state.')
  const [body, mac] = parts
  if (!body || !mac) throw new Error('Malformed OAuth state.')

  let expected: string
  try {
    expected = createHmac('sha256', stateSecret()).update(body).digest('base64url')
  } catch {
    throw new Error('Malformed OAuth state.')
  }

  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('OAuth state signature mismatch.')
  }

  let payload: StatePayload
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as StatePayload
  } catch {
    throw new Error('Malformed OAuth state.')
  }
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
  // Defense in depth: sanitize here too, even though the route already
  // validates its query param — this keeps the guarantee attached to the
  // function itself rather than relying on every caller to remember it.
  return buildConsentUrl({
    state: signState({
      orgId,
      userId,
      returnTo: sanitizeReturnTo(returnTo),
      issuedAt: Date.now(),
    }),
  })
}

export async function completeConnect(
  code: string,
  state: string,
): Promise<{ accountId: string; orgId: string; returnTo: string }> {
  const { orgId, userId, returnTo: rawReturnTo } = verifyState(state)
  // Defense in depth: `state` may have been minted by an older build that
  // signed an unvalidated `returnTo`, or the signing key may have leaked.
  // Re-validate here rather than trusting the signature alone to have
  // carried a safe value.
  const returnTo = sanitizeReturnTo(rawReturnTo)

  const db = createAdminClient()

  // Defense in depth: `state` is only ever minted by the /api/oauth/google/
  // start route, which already requires board-or-admin before signing it —
  // but the signature stays valid for STATE_TTL_MS, and this function
  // writes mailbox_accounts through the admin (service-role) client, which
  // bypasses the board_access RLS policy that would otherwise backstop the
  // write. Re-checking the role here, at the point of the write, closes
  // the narrow window where a caller's role is revoked between starting
  // and completing the OAuth dance, and protects any future caller of
  // completeConnect that forgets to gate itself the way /start does.
  const { data: membership, error: roleError } = await db
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle<{ role: string }>()

  if (roleError) {
    logDbError('completeConnect', 'org_members', { orgId, userId }, roleError)
    throw new Error(`completeConnect: failed to verify permissions: ${roleError.message}`)
  }
  if (!membership || (membership.role !== 'admin' && membership.role !== 'board')) {
    throw new Error('You do not have permission to connect a mailbox for this organization.')
  }

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
  const sendAs = await client.listSendAs().catch((error: unknown) => {
    // A real outage here silently degrades the scope recommendation to
    // "no aliases" rather than failing the whole connect — that's the
    // right tradeoff (a fresh mailbox connection shouldn't hard-fail
    // over a secondary Gmail API call), but it should leave a trace
    // instead of vanishing entirely.
    console.error('completeConnect: listSendAs failed, continuing with no aliases', {
      message: error instanceof Error ? error.message : String(error),
    })
    return []
  })
  const recommended = recommendScope(sendAs, profile.emailAddress)

  // Every LIVE account for this org, not just one matching this address
  // (amended post-review — final branch review, Fix 4). Two things depend
  // on seeing the whole set:
  //
  //   1. Reconnecting the SAME address reuses its row so ingested history
  //      and its threads survive — never create a second account row for
  //      a reconnect. (Unchanged.)
  //   2. A DIFFERENT address is refused outright. `mailbox_accounts_live_uniq`
  //      is a partial unique index on (organization_id, email_address), so
  //      the database happily allows several live accounts per org, and
  //      mailboxSyncJob loops over all of them — mail from both flows into
  //      the shared inbox. But getMailboxStatus is
  //      `.order('connected_at', desc).limit(1)`, so the UI only ever
  //      renders the newest one: the older account's scope picker and
  //      Disconnect button become unreachable. The realistic path is not
  //      exotic — a board member clicks "Reconnect" (both alerts link to a
  //      bare /api/oauth/google/start with no login_hint), Google defaults
  //      to their PERSONAL account, they consent, and the old lookup —
  //      keyed on (orgId, profile.emailAddress) — found no match and
  //      inserted a second row. Their personal Gmail then synced into a
  //      board-visible inbox with no way to remove it from the UI.
  //
  // Refusing is the right call rather than silently repointing the
  // existing row at the new address: the existing row owns ingested
  // threads and messages belonging to the OLD mailbox, and rewriting its
  // email_address would relabel that correspondence as having come from
  // an address it never came from.
  const { data: liveAccounts, error: lookupError } = await db
    .from('mailbox_accounts')
    .select('id, email_address')
    .eq('organization_id', orgId)
    .is('disconnected_at', null)

  if (lookupError) {
    logDbError('completeConnect', 'mailbox_accounts', { orgId }, lookupError)
    throw new Error(
      `completeConnect: failed to check for an existing mailbox connection: ${lookupError.message}`,
    )
  }

  const existing =
    (liveAccounts ?? []).find((a) => a.email_address === profile.emailAddress) ?? null
  const otherLive = (liveAccounts ?? []).find(
    (a) => a.email_address !== profile.emailAddress,
  )

  if (!existing && otherLive) {
    // The refresh token we just minted is for a mailbox we are refusing to
    // store. Dropping it on the floor would leave a live Google-side grant
    // over someone's (quite possibly personal) mailbox with nothing on our
    // side able to revoke it later — we never persist it, so no disconnect
    // path would ever reach it. Best-effort teardown, same policy as
    // disconnectMailbox: a failure here is logged, never surfaced in place
    // of the actionable message below.
    try {
      await revokeToken(tokens.refreshToken)
    } catch (error) {
      console.error('completeConnect: failed to revoke the rejected grant', {
        orgId,
        message: error instanceof Error ? error.message : String(error),
      })
    }

    // Names BOTH addresses on purpose: "a mailbox is already connected" is
    // unactionable when the whole failure mode is that Google silently
    // signed the user in as someone they did not intend. The callback
    // route redirects this message to /settings/mailbox?error=… where it
    // renders verbatim.
    throw new Error(
      `You signed in as ${profile.emailAddress}, but this organization already has ` +
        `${otherLive.email_address} connected. Disconnect ${otherLive.email_address} ` +
        `first, or start again and choose ${otherLive.email_address} on Google's ` +
        `account picker.`,
    )
  }

  let accountId: string

  if (existing) {
    accountId = existing.id
    // Deliberately NOT updating scope_mode/scope_value/display_name here.
    // `recommended` reflects this run's Gmail state, but a tenant may
    // have hand-narrowed scope_value after the initial connect (e.g. to
    // a single label) specifically to limit what the mailbox ingests —
    // silently overwriting that on every reconnect would be a privacy
    // regression disguised as a bug fix. If Google's recommendation
    // should ever win on reconnect, that needs an explicit signal (e.g.
    // "reset to recommended" in the UI), not an implicit one here.
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
