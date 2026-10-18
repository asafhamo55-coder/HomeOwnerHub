'use server'

import { revalidatePath } from 'next/cache'
import { BOARD_ONLY_DENIED, requireBoardOrAdminForAction } from '@/lib/accounting/guard'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import { propertyHref } from './href'
import { asPropertyId } from './resolve'
import { recordSale, validateSale, type RawSale } from './sale'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type RecordSaleResult =
  | {
      ok: true
      data: {
        /** One per buyer, in the order entered: who can be invited to the portal next. */
        buyers: Array<{ name: string; email: string | null; listed: boolean }>
        movedOut: number
        leasesEnded: number
        tenureReset: boolean
      }
    }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/**
 * "Record a sale" on the property page (P3, PR-03). Board/admin only —
 * gated before any client is built. Validates with the same rules the
 * dialog uses (sale-rules.ts), against the association's today, then runs
 * the whole transfer in lib/properties/sale.ts (compensated on failure).
 * Sends nothing: inviting a buyer to the portal is a separate click.
 */
export async function recordPropertySale(propertyId: string, raw: RawSale): Promise<RecordSaleResult> {
  const gate = await requireBoardOrAdminForAction(BOARD_ONLY_DENIED)
  if (!gate.ok) return { ok: false, error: gate.error }
  if (typeof propertyId !== 'string' || !UUID.test(propertyId)) return { ok: false, error: 'Property not found.' }

  const orgId = gate.orgId
  const supabase = await getSupabaseServerClient()
  const today = todayIn(await orgTimeZone(supabase, orgId))

  const checked = validateSale(raw ?? {}, today)
  if (!checked.ok) return { ok: false, error: checked.error, fieldErrors: checked.fieldErrors }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const pid = asPropertyId(propertyId)

  const result = await recordSale(supabase, { ...checked.value, orgId, propertyId: pid, userId: user?.id ?? null })
  if (!result.ok) {
    return result.field ? { ok: false, error: result.error, fieldErrors: { [result.field]: result.error } } : { ok: false, error: result.error }
  }

  revalidatePath(propertyHref(pid))
  revalidatePath('/properties')
  return {
    ok: true,
    data: {
      buyers: checked.value.buyers.map((b, i) => ({ name: b.name, email: b.email, listed: result.data.buyerResidentIds[i] !== null })),
      movedOut: result.data.movedOutResidentIds.length,
      leasesEnded: result.data.endedTenancyIds.length,
      tenureReset: result.data.tenureReset,
    },
  }
}
