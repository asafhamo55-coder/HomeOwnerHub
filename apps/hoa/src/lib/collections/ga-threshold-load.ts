import type { SupabaseClient } from '@supabase/supabase-js'
import { M5_APPLIED } from '@homeowner-portal/db/m5'
import { loadDuesRates } from '@/lib/dues-rates/queries'
import { loadEstoppelInput } from '@/lib/properties/estoppel/load'
import type { PropertyId } from '@/lib/properties/resolve'
import { gaThresholdView, type GaThresholdView } from './ga-threshold'

/**
 * BL-158: the Georgia threshold panel's reads, with the caller's
 * cookie-bound client so RLS applies on top of the page's board gate.
 * Reads only: the ledger through the estoppel loader (which throws on a
 * failed or truncated read, like the collections letter) and, when M5 is
 * on, the dues-rate schedule. null when the home isn't in the org or its
 * association isn't in Georgia. A failed dues-rate read is not fatal: the
 * panel shows the threshold as a range and says the schedule couldn't be read.
 */
export async function loadGaThreshold(supabase: SupabaseClient, orgId: string, propertyId: PropertyId, live: boolean = M5_APPLIED): Promise<GaThresholdView | null> {
  const ctx = await loadEstoppelInput(supabase, orgId, propertyId)
  if (!ctx) return null
  if ((ctx.input.state ?? '').trim().toUpperCase() !== 'GA') return null
  const rates = live && ctx.associationId ? await loadDuesRates(supabase as never, ctx.associationId, live) : []
  return gaThresholdView(ctx.input, ctx.today, { rates, live })
}
