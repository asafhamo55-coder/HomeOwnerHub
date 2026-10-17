import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireOrgOwned, requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { checkWrite } from '@/lib/api/db'
import { ApiRouteError } from '@/lib/api/errors'
import { withRoute } from '@/lib/api/handler'
import { MAX_SHORT_TEXT } from '@/lib/api/limits'
import { logRouteFailure } from '@/lib/api/log'
import { parseJson, parseValue } from '@/lib/api/parse'
import { zText, zUuid } from '@/lib/api/schemas'
import { getPlaidClient } from '@/lib/plaid'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

/**
 * POST /api/plaid/exchange — board/admin only (called from the
 * (dashboard) accounting/bank LinkPlaidButton).
 *
 * Body: { publicToken: string, fundId: uuid }
 *
 *   1. Gate (board/admin), then config, then parse + validate.
 *   2. The fund must belong to the caller's org AND its primary
 *      association (R-18) — checked before any Plaid item is minted.
 *   3. Exchange the public token → access_token + item_id.
 *   4. /accounts/get (+ institution name).
 *   5a. INSERT one bank_accounts row per depository account (checking /
 *       savings / money market) in ONE statement — all-or-nothing.
 *   5b. INSERT plaid_items (the access token) LAST.
 *   6. 201 { itemId, institutionName, bankAccountIds }.
 *
 * Why this order (RC-6): every write must be undoable by the caller who
 * made it. bank_accounts is board/admin DELETE-able (0061), plaid_items is
 * INSERT-only for users (no user may read or delete a token). So the
 * deletable rows go first and the undeletable row goes last; nothing can
 * fail after it. Compensation runs in reverse order:
 *   - 5a fails  → itemRemove (nothing stored).
 *   - 5b fails  → DELETE our bank_accounts rows, then itemRemove.
 * Each compensation step is best effort and logged by code; it never
 * masks the original error. The one thing that cannot be compensated is
 * the process dying between 5a and 5b: inert bank_accounts rows with no
 * plaid_items row (plaid-sync reads plaid_items, so they never sync) and a
 * live Item at Plaid.
 *
 * A 23505 on either insert means this Item is already stored (both are
 * unique on plaid_item_id): 409 conflict reason already_linked, and the
 * stored Item's token is NOT revoked.
 */

/** The body is two short fields; 16 KB is far above any legitimate request (lowered from MAX_JSON_BYTES). */
const MAX_BODY_BYTES = 16 * 1024

/** Plaid public tokens are ~60 ASCII chars; anything past this is a size violation (413), not a shape miss. */
const MAX_PUBLIC_TOKEN = MAX_SHORT_TEXT

const Body = z.object({
  publicToken: zText(MAX_PUBLIC_TOKEN, 1),
  fundId: zUuid,
})

const DEPOSITORY = new Set(['checking', 'savings', 'money market'])

const ALREADY_LINKED = { reason: 'already_linked', message: 'This bank connection is already linked.' }

/** The Plaid error code (e.g. INVALID_PUBLIC_TOKEN), never its message. */
function plaidErrorCode(err: unknown): string | null {
  const data = (err as { response?: { data?: { error_code?: unknown } } } | null)?.response?.data
  return typeof data?.error_code === 'string' ? data.error_code : null
}

export const POST = withRoute('plaid.exchange', async (request) => {
  // Before anything else: a caller the plaid_items INSERT policy (0061)
  // would refuse must not get as far as minting an access token.
  const { orgId } = await requireRouteBoardOrAdmin()

  const client = getPlaidClient()
  if (!client) throw new ApiRouteError('not_configured', 'Bank linking is not set up yet.')

  const raw = await parseJson(request, z.unknown(), { maxBytes: MAX_BODY_BYTES })
  const token = (raw as { publicToken?: unknown } | null)?.publicToken
  if (typeof token === 'string' && new TextEncoder().encode(token).byteLength > MAX_PUBLIC_TOKEN) {
    throw new ApiRouteError('payload_too_large', 'That bank link token is too long.', { maxBytes: MAX_PUBLIC_TOKEN })
  }
  const body = parseValue(Body, raw)

  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    throw new ApiRouteError('not_found', 'This organization has no association set up yet.', {
      reason: 'no_association',
    })
  }

  const FUND_NOT_FOUND = 'We could not find that fund.'
  await requireOrgOwned('funds', body.fundId, orgId, { message: FUND_NOT_FOUND })

  const supabase = await getSupabaseServerClient()

  // The fund must also belong to the association the accounts attach to.
  const { data: fund, error: fundErr } = await supabase
    .from('funds')
    .select('id')
    .eq('id', body.fundId)
    .eq('organization_id', orgId)
    .eq('association_id', assoc.id)
    .maybeSingle()
  if (fundErr) {
    logRouteFailure('plaid.exchange.fund', fundErr, { orgId })
    throw new ApiRouteError('internal')
  }
  if (!fund) throw new ApiRouteError('not_found', FUND_NOT_FOUND)

  // 3. Exchange.
  let accessToken: string
  let itemId: string
  try {
    const resp = await client.itemPublicTokenExchange({ public_token: body.publicToken })
    accessToken = resp.data.access_token
    itemId = resp.data.item_id
  } catch (err) {
    logRouteFailure('plaid.exchange.token', err, { orgId, plaidErrorCode: plaidErrorCode(err) })
    throw new ApiRouteError('upstream_unavailable', 'Plaid could not complete the bank link. Try linking again.')
  }

  /** Revoke the just-minted Item. Best effort: a failure here is logged, never masks the original error. */
  async function removeItem(stage: string): Promise<void> {
    try {
      await client!.itemRemove({ access_token: accessToken })
    } catch (err) {
      logRouteFailure('plaid.exchange.item_remove', err, { orgId, stage, plaidErrorCode: plaidErrorCode(err) })
    }
  }

  // 4. Accounts + institution.
  let accounts: Array<{ account_id: string; name: string; subtype: string | null; mask: string | null }>
  let institutionId: string | null
  let institutionName: string | null = null
  try {
    const resp = await client.accountsGet({ access_token: accessToken })
    accounts = resp.data.accounts.map((a) => ({
      account_id: a.account_id,
      name: a.name,
      subtype: a.subtype,
      mask: a.mask,
    }))
    institutionId = resp.data.item.institution_id ?? null
    if (institutionId) {
      const inst = await client.institutionsGetById({
        institution_id: institutionId,
        country_codes: ['US'] as never,
      })
      institutionName = inst.data.institution.name
    }
  } catch (err) {
    logRouteFailure('plaid.exchange.accounts', err, { orgId, plaidErrorCode: plaidErrorCode(err) })
    await removeItem('accounts')
    throw new ApiRouteError('upstream_unavailable', 'Plaid could not list the bank accounts. Try linking again.')
  }

  /**
   * Undo 5a. Best effort, like removeItem: a failure is logged by code and
   * never masks the original error. `count: 'exact'` because an RLS-filtered
   * delete "succeeds" having deleted nothing. If this fails, the rows left
   * behind are inert bank_accounts with no plaid_items row (plaid-sync reads
   * plaid_items, so they never sync); `left` in the log says how many.
   */
  async function deleteBankAccounts(ids: string[]): Promise<void> {
    if (ids.length === 0) return
    try {
      const { error, count } = await supabase.from('bank_accounts').delete({ count: 'exact' }).in('id', ids)
      if (error || count !== ids.length) {
        logRouteFailure('plaid.exchange.compensate.bank_accounts', error ?? { code: 'partial_delete' }, {
          orgId,
          count: ids.length,
          left: ids.length - (error ? 0 : (count ?? 0)),
        })
      }
    } catch (err) {
      logRouteFailure('plaid.exchange.compensate.bank_accounts', err, { orgId, count: ids.length, left: ids.length })
    }
  }

  // 5a. bank_accounts FIRST. Board/admin may DELETE them (0061 `simple`
  // tables), so this is the step a later failure can undo. HOA accounting
  // only tracks cash-equivalent accounts; credit cards etc. on the same
  // Item are skipped. One statement, so the account set is all-or-nothing.
  const rows = accounts
    .filter((a) => a.subtype !== null && DEPOSITORY.has(a.subtype))
    .map((a) => ({
      organization_id: orgId,
      association_id: assoc.id,
      fund_id: body.fundId,
      plaid_item_id: itemId,
      plaid_account_id: a.account_id,
      account_name: a.name,
      bank_name: institutionName,
      last4: a.mask,
    }))

  let bankAccountIds: string[] = []
  if (rows.length > 0) {
    const { data, error: baErr } = await supabase.from('bank_accounts').insert(rows).select('id')
    if (baErr || !data) {
      if (baErr && String(baErr.code) === '23505') {
        // bank_accounts_plaid_uniq (plaid_item_id, plaid_account_id): this
        // Item's accounts are already stored, so its token is live in
        // plaid_items — revoking it would break the existing link.
        checkWrite({ error: baErr }, 'plaid.exchange.bank_accounts', { orgId }, { conflict: ALREADY_LINKED })
      }
      await removeItem('bank_accounts')
      checkWrite({ error: baErr ?? { code: 'no_rows' } }, 'plaid.exchange.bank_accounts', {
        orgId,
        count: rows.length,
      })
      throw new ApiRouteError('internal')
    }
    bankAccountIds = data.map((r) => r.id)
  }

  // 5b. plaid_items LAST: it is INSERT-only for users (0061 — no user can
  // read or delete a token), so nothing after it may fail. Not yet in the
  // regenerated types; the `as never` casts unblock typecheck. No .select().
  const { error: piErr } = await supabase
    .from('plaid_items' as never)
    .insert({
      organization_id: orgId,
      association_id: assoc.id,
      plaid_item_id: itemId,
      access_token: accessToken,
      institution_id: institutionId,
      institution_name: institutionName,
    } as never)
  if (piErr) {
    // Compensate in reverse order: our bank rows, then the Plaid Item.
    await deleteBankAccounts(bankAccountIds)
    if (String(piErr.code) === '23505') {
      // plaid_item_id UNIQUE: another request stored this Item first. That
      // row's token is live — do not revoke it.
      checkWrite({ error: piErr }, 'plaid.exchange.plaid_items', { orgId }, { conflict: ALREADY_LINKED })
    }
    await removeItem('plaid_items')
    checkWrite({ error: piErr }, 'plaid.exchange.plaid_items', { orgId })
  }

  return NextResponse.json({ itemId, institutionName, bankAccountIds }, { status: 201 })
})
