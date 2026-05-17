import { NextResponse } from 'next/server'
import { Products, CountryCode } from 'plaid'
import { getPlaidClient } from '@/lib/plaid'
import { getPrimaryAssociation } from '@/lib/vendors'

/**
 * POST /api/plaid/link-token
 *
 * Returns a fresh Link token the browser hands to Plaid Link. The
 * client_user_id is the association id so Plaid's dashboard view groups
 * link sessions by HOA.
 *
 * No body required.
 */
export async function POST() {
  const client = getPlaidClient()
  if (!client) {
    return NextResponse.json(
      { error: 'plaid_not_configured', message: 'Set PLAID_CLIENT_ID and PLAID_SECRET to enable bank linking.' },
      { status: 503 },
    )
  }

  const assoc = await getPrimaryAssociation()
  if (!assoc) {
    return NextResponse.json({ error: 'no_association' }, { status: 400 })
  }

  try {
    const resp = await client.linkTokenCreate({
      user: { client_user_id: assoc.id },
      client_name: 'HomeownerHub',
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: 'en',
    })
    return NextResponse.json({ link_token: resp.data.link_token, expiration: resp.data.expiration })
  } catch (err) {
    return NextResponse.json(
      {
        error: 'plaid_link_token_failed',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
