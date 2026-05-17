import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getPlaidClient } from '@/lib/plaid'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getPrimaryAssociation } from '@/lib/vendors'

/**
 * POST /api/plaid/exchange
 *
 * Body: { public_token: string, fundId: string }
 *
 * Steps:
 *   1. Exchange Plaid public_token → access_token + item_id.
 *   2. /accounts/get to enumerate the linked accounts (one Item can hold
 *      multiple). Caller picks which to import via fundId — we link
 *      every checking/savings account on the Item to the chosen fund.
 *   3. INSERT plaid_items + one bank_accounts row per Plaid account.
 *   4. Return the linked bank_accounts so the UI can show them.
 *
 * Pre-req: migration 0009_plaid_items.sql must be applied. If the
 * plaid_items table is missing, the INSERT fails loud with a clear
 * Postgres error.
 */

const ExchangeSchema = z.object({
  public_token: z.string().min(1),
  fundId: z.string().uuid(),
})

export async function POST(request: Request) {
  const client = getPlaidClient()
  if (!client) {
    return NextResponse.json(
      { error: 'plaid_not_configured' },
      { status: 503 },
    )
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return NextResponse.json({ error: 'no_association' }, { status: 400 })
  }

  const body = await request.json().catch(() => null)
  const parsed = ExchangeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid payload' },
      { status: 400 },
    )
  }

  // Exchange first — quick fail if the token is bad.
  let accessToken: string
  let itemId: string
  try {
    const resp = await client.itemPublicTokenExchange({
      public_token: parsed.data.public_token,
    })
    accessToken = resp.data.access_token
    itemId = resp.data.item_id
  } catch (err) {
    return NextResponse.json(
      {
        error: 'plaid_exchange_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  // Pull account details.
  let accounts: Array<{
    account_id: string
    name: string
    subtype: string | null
    mask: string | null
  }> = []
  let institutionId: string | null = null
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
    return NextResponse.json(
      {
        error: 'plaid_accounts_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }

  const supabase = await getSupabaseServerClient()

  // Resolve org_id for FK on plaid_items / bank_accounts.
  const { data: assocRow } = await supabase
    .from('associations')
    .select('organization_id')
    .eq('id', assoc.id)
    .single()
  if (!assocRow) {
    return NextResponse.json({ error: 'association_not_found' }, { status: 404 })
  }

  // plaid_items table — not yet in regenerated types (migration 0009
  // ships in this batch but needs manual apply via Supabase SQL editor).
  // The `as never` cast unblocks typecheck; regenerate after applying.
  const { error: piErr } = await supabase
    .from('plaid_items' as never)
    .insert({
      organization_id: assocRow.organization_id,
      association_id: assoc.id,
      plaid_item_id: itemId,
      access_token: accessToken,
      institution_id: institutionId,
      institution_name: institutionName,
    } as never)
  if (piErr) {
    return NextResponse.json(
      {
        error: 'plaid_items_insert_failed',
        message:
          piErr.message +
          ' — confirm migrations/0009_plaid_items.sql has been applied.',
      },
      { status: 500 },
    )
  }

  // Filter to depository accounts only (checking/savings). Plaid will
  // also return credit cards on a typical link; HOA accounting cares
  // only about the cash-equivalent ones.
  const linkable = accounts.filter(
    (a) =>
      a.subtype === 'checking' ||
      a.subtype === 'savings' ||
      a.subtype === 'money market',
  )

  const insertedAccountIds: string[] = []
  for (const a of linkable) {
    const { data: row, error } = await supabase
      .from('bank_accounts')
      .insert({
        organization_id: assocRow.organization_id,
        association_id: assoc.id,
        fund_id: parsed.data.fundId,
        plaid_item_id: itemId,
        plaid_account_id: a.account_id,
        account_name: a.name,
        bank_name: institutionName,
        last4: a.mask,
      })
      .select('id')
      .single()
    if (error) {
      // Duplicate plaid_account_id (re-link) is benign — keep going.
      if (error.code !== '23505') {
        return NextResponse.json(
          { error: 'bank_account_insert_failed', message: error.message },
          { status: 500 },
        )
      }
    } else if (row) {
      insertedAccountIds.push(row.id)
    }
  }

  return NextResponse.json({
    ok: true,
    item_id: itemId,
    institution_name: institutionName,
    bank_account_ids: insertedAccountIds,
  })
}
