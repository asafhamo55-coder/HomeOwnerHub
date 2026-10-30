import type { SupabaseClient } from '@supabase/supabase-js'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { logRouteFailure } from '@/lib/api/log'
import { getPrimaryAssociationResult } from '@/lib/primary-association'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { buildReminderPackets } from '@/lib/dues-reminders/packets'
import { todayIn } from '@/lib/association-time'
import { AGING_LABELS, parseAgingParam } from '@/lib/dues/aging'
import { ageOwners, oldestUnpaidDue, ownersForAging } from '@/lib/dues/who-owes'
import { loadCreditByUnit } from '@/lib/dues/unit-credit'
import { csvDocument } from '@/lib/csv'

/**
 * GET /dues/export?aging=<bucket> — the Who owes list as CSV.
 *
 * Board/admin only, checked before any client is made. Read-only. The owners
 * and amounts come from the same loader and the same ageOwners() the panel
 * on /dues uses, so the file is exactly the screen for that filter. No
 * emails or phone numbers: a name, the unit(s), and the money.
 */

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const HEADER = ['Unit', 'Owner name', 'Aging', 'Amount owed', 'Oldest unpaid due date', 'Credit on account']

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2)

export const GET = withRoute('dues.who-owes-export', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const aging = parseAgingParam(new URL(request.url).searchParams.get('aging') ?? undefined)

  const assocRes = await getPrimaryAssociationResult()
  if (!assocRes.ok) {
    logRouteFailure('dues.who-owes-export.association', new Error('association read failed'), { orgId })
    throw new ApiRouteError('internal')
  }
  if (!assocRes.data) throw new ApiRouteError('not_found', 'No association is set up yet.')
  const assoc = assocRes.data

  let packets
  try {
    packets = (await buildReminderPackets(assoc.id, assoc.timeZone)).packets
  } catch (e) {
    logRouteFailure('dues.who-owes-export.read', e, { orgId })
    throw new ApiRouteError('internal')
  }

  const today = todayIn(assoc.timeZone)
  const owners = ownersForAging(ageOwners(packets, today), aging)

  const supabase = await getSupabaseServerClient()
  const credit = await loadCreditByUnit(
    supabase as unknown as SupabaseClient,
    owners.flatMap((o) => o.packet.properties.map((p) => p.unitId)),
  )

  const body = csvDocument(
    HEADER,
    owners.map(({ packet, bucket }) => [
      packet.properties.map((p) => p.label).join('; '),
      packet.ownerName,
      AGING_LABELS[bucket],
      money(packet.totalDue),
      oldestUnpaidDue(packet),
      money(packet.properties.reduce((s, p) => s + (credit.get(p.unitId) ?? 0), 0)),
    ]),
  )

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="who-owes-${aging ?? 'all'}-${today}.csv"`,
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  })
})
