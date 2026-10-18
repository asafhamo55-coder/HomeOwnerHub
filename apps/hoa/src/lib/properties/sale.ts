/**
 * Record a sale (Properties P3, PR-03): one guided, single-step change of
 * ownership, the way Buildium / Vantaca model it — a dated ownership
 * period ends and a new one begins; nothing is overwritten.
 *
 * What one sale does, in order (each write undone in REVERSE order if a
 * later one fails — lot.ts's compensation pattern; there is no
 * transaction):
 *
 *   1. close every current ownership on the lot's units
 *      (valid_to = settlement date, never before that row's valid_from);
 *   2. open the buyers' ownerships on the canonical unit
 *      (valid_from = settlement date, source 'sale', each buyer's %);
 *   3. point the home's owner fields at the primary buyer (P0 keeps
 *      hoa_properties and ownerships in step) and, when tenants are not
 *      carried over, reset tenure to "unknown" for the board to set;
 *   4. move the seller's household out of property_residents
 *      (moved_out_at = settlement date) — with step 1 this is what ends the
 *      seller's portal access: auth_resident_unit_ids (0061) reads only
 *      current ownerships and residents not moved out;
 *   5. when tenants are not carried over, end their active leases and move
 *      their resident rows out too;
 *   6. optionally list the buyers as owner residents (no invitation is
 *      sent — the board clicks "Invite to portal" afterwards);
 *   7. write the `ownership_changed` property event (ids, counts and the
 *      date only) — the audit row. A sale that can't be audited is undone.
 *
 * The balance stays with the lot: charges and payments are keyed by unit
 * and are not touched. What the buyer may SEE is the resident portal's
 * job (resident-sale-window.ts scopes it to charges from the buyer's
 * valid_from).
 *
 * Plain functions (no 'use server'); the action in sale-actions.ts gates
 * on board/admin before building the client. Every read and write is
 * scoped to the caller's org. Logs carry step names, ids, counts and
 * error codes only — never names, emails, phones or addresses.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { resolveUnitForProperty, type PropertyId, type UnitId } from './resolve'
import type { LotResult } from './lot'
import { closingDay, mailingNote, type SaleInput } from './sale-rules'

type Db = SupabaseClient<Database>
type PropertyPatch = Database['public']['Tables']['hoa_properties']['Update']
type Tenure = Database['public']['Enums']['property_tenure']

export * from './sale-rules'

const lower = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

// ─── The write ───────────────────────────────────────────────────────

export interface RecordSaleInput extends SaleInput {
  orgId: string
  propertyId: PropertyId
  userId: string | null
}

export interface RecordedSale {
  unitId: UnitId
  closedOwnershipIds: string[]
  newOwnershipIds: string[]
  movedOutResidentIds: string[]
  endedTenancyIds: string[]
  /** Buyer resident rows created (property_residents ids), in buyer order; null = not added. */
  buyerResidentIds: Array<string | null>
  tenureReset: boolean
  eventId: string
}

interface PropertyRow {
  id: string
  owner_name: string | null
  owner_email: string | null
  owner_phone: string | null
  tenure: Tenure | null
  tenure_updated_at: string | null
  tenure_updated_by: string | null
}

interface CurrentOwnership {
  id: string
  owner_email: string | null
  valid_from: string
}

interface ResidentRow {
  id: string
  email: string | null
  role: string
}

interface TenancyRow {
  id: string
  status: string
  lease_end: string | null
}

const SELLER_HOUSEHOLD = new Set(['owner', 'family_member', 'other'])

function logFailure(step: string, error: unknown, ids: Record<string, string | number | null>): void {
  const e = error as { code?: string } | null
  console.error(`[properties.sale] ${step} failed`, { ...ids, code: e?.code ?? null })
}

async function compensate(
  step: string,
  ids: Record<string, string | number | null>,
  run: () => PromiseLike<{ error: unknown }>,
): Promise<void> {
  try {
    const { error } = await run()
    if (error) logFailure(`compensate.${step}`, error, ids)
  } catch (err) {
    logFailure(`compensate.${step}`, err, ids)
  }
}

const NOTHING_CHANGED = 'Couldn’t record the sale. Nothing was changed. Try again.'

/**
 * Record a validated sale. Returns a user-safe error (never database
 * text); on any failure after the first write, every earlier write is
 * undone in reverse order before returning.
 */
export async function recordSale(db: Db, input: RecordSaleInput): Promise<LotResult<RecordedSale>> {
  const { orgId, propertyId, settlementDate, buyers } = input
  const ids = { orgId, propertyId }

  // ── reads ──
  const { data: prop, error: propErr } = await db
    .from('hoa_properties')
    .select('id, owner_name, owner_email, owner_phone, tenure, tenure_updated_at, tenure_updated_by')
    .eq('id', propertyId)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle<PropertyRow>()
  if (propErr) {
    logFailure('read.hoa_properties', propErr, ids)
    return { ok: false, error: 'Couldn’t load the property. Try again.' }
  }
  if (!prop) return { ok: false, error: 'Property not found.' }

  let unitId: UnitId | null
  let unitIds: UnitId[]
  try {
    const r = await resolveUnitForProperty(db, orgId, propertyId)
    unitId = r.unitId
    unitIds = r.unitIds
  } catch {
    return { ok: false, error: 'Couldn’t load the property’s unit record. Try again.' }
  }
  if (!unitId) {
    return {
      ok: false,
      error: 'This home isn’t linked to a unit record, so there is no ownership to transfer. Edit and save the property once to link it, then record the sale.',
    }
  }

  const { data: ownRows, error: ownErr } = await db
    .from('ownerships')
    .select('id, owner_email, valid_from')
    .eq('organization_id', orgId)
    .in('unit_id', unitIds)
    .is('valid_to', null)
  if (ownErr) {
    logFailure('read.ownerships', ownErr, ids)
    return { ok: false, error: NOTHING_CHANGED }
  }
  const sellers = (ownRows ?? []) as CurrentOwnership[]
  const sellerEmails = new Set(sellers.map((s) => lower(s.owner_email)).filter(Boolean))
  if (prop.owner_email) sellerEmails.add(lower(prop.owner_email))
  const repeat = buyers.findIndex((b) => b.email && sellerEmails.has(lower(b.email)))
  if (repeat !== -1) {
    return {
      ok: false,
      error: 'A buyer has the same email as the current owner. A sale moves the home to someone new; to fix a contact detail, edit the property instead.',
      field: `buyers.${repeat}.email`,
    }
  }

  const { data: resRows, error: resErr } = await db
    .from('property_residents')
    .select('id, email, role')
    .eq('organization_id', orgId)
    .eq('property_id', propertyId)
    .is('moved_out_at', null)
    .is('deleted_at', null)
  if (resErr) {
    logFailure('read.property_residents', resErr, ids)
    return { ok: false, error: NOTHING_CHANGED }
  }
  const residents = (resRows ?? []) as ResidentRow[]
  const buyerEmails = new Set(buyers.map((b) => lower(b.email)).filter(Boolean))
  const isBuyer = (r: ResidentRow) => r.email !== null && buyerEmails.has(lower(r.email))
  const moveOut = residents.filter(
    (r) => !isBuyer(r) && (SELLER_HOUSEHOLD.has(r.role) || (!input.carryTenants && r.role === 'tenant')),
  )

  let leases: TenancyRow[] = []
  if (!input.carryTenants) {
    const { data, error } = await db
      .from('tenancies')
      .select('id, status, lease_end')
      .eq('organization_id', orgId)
      .in('unit_id', unitIds)
      .eq('status', 'active')
    if (error) {
      logFailure('read.tenancies', error, ids)
      return { ok: false, error: NOTHING_CHANGED }
    }
    leases = (data ?? []) as TenancyRow[]
  }

  // ── writes ──
  const undo: Array<() => Promise<void>> = []
  const fail = async (step: string, error: unknown, message = NOTHING_CHANGED) => {
    logFailure(step, error, ids)
    for (const u of undo) await u()
    return { ok: false as const, error: message }
  }

  // 1. close the sellers' ownerships
  const closed: string[] = []
  const reopenClosed = () =>
    closed.length === 0
      ? Promise.resolve()
      : compensate('ownerships.close', { orgId, count: closed.length }, () =>
          db.from('ownerships').update({ valid_to: null }).in('id', [...closed]).eq('organization_id', orgId),
        )
  for (const s of sellers) {
    const { error } = await db
      .from('ownerships')
      .update({ valid_to: closingDay(settlementDate, s.valid_from) })
      .eq('id', s.id)
      .eq('organization_id', orgId)
      .is('valid_to', null)
    if (error) {
      await reopenClosed()
      return fail('ownerships.close', error)
    }
    closed.push(s.id)
  }
  undo.unshift(reopenClosed)

  // 2. open the buyers' ownerships
  const { data: opened, error: openErr } = await db
    .from('ownerships')
    .insert(
      buyers.map((b) => ({
        organization_id: orgId,
        unit_id: unitId,
        owner_name: b.name,
        owner_email: b.email,
        owner_phone: b.phone,
        ownership_pct: b.pct,
        valid_from: settlementDate,
        source: 'sale',
        created_by: input.userId,
      })),
    )
    .select('id')
  const newOwnershipIds = ((opened ?? []) as Array<{ id: string }>).map((o) => o.id)
  if (openErr || newOwnershipIds.length !== buyers.length) {
    if (newOwnershipIds.length > 0) {
      await compensate('ownerships.open', { orgId, count: newOwnershipIds.length }, () =>
        db.from('ownerships').delete().in('id', newOwnershipIds).eq('organization_id', orgId),
      )
    }
    return fail('ownerships.open', openErr)
  }
  undo.unshift(() =>
    compensate('ownerships.open', { orgId, count: newOwnershipIds.length }, () =>
      db.from('ownerships').delete().in('id', newOwnershipIds).eq('organization_id', orgId),
    ),
  )

  // 3. the home's owner fields → the primary buyer; tenure → unknown when tenants leave
  const primary = buyers[0]!
  const tenureReset = !input.carryTenants && (prop.tenure ?? 'unknown') !== 'unknown'
  const propPatch: PropertyPatch = {
    owner_name: primary.name,
    owner_email: primary.email,
    owner_phone: primary.phone,
  }
  if (tenureReset) {
    propPatch.tenure = 'unknown'
    propPatch.tenure_updated_at = new Date().toISOString()
    propPatch.tenure_updated_by = input.userId
  }
  const { error: propUpdErr } = await db.from('hoa_properties').update(propPatch).eq('id', propertyId).eq('org_id', orgId)
  if (propUpdErr) return fail('hoa_properties.update', propUpdErr)
  undo.unshift(() => {
    const back: PropertyPatch = {
      owner_name: prop.owner_name,
      owner_email: prop.owner_email,
      owner_phone: prop.owner_phone,
    }
    if (tenureReset) {
      back.tenure = prop.tenure ?? 'unknown'
      back.tenure_updated_at = prop.tenure_updated_at
      back.tenure_updated_by = prop.tenure_updated_by
    }
    return compensate('hoa_properties.update', ids, () =>
      db.from('hoa_properties').update(back).eq('id', propertyId).eq('org_id', orgId),
    )
  })

  // 4–5. the seller's household (and, if not carried over, the tenants) move out
  const movedOutResidentIds = moveOut.map((r) => r.id)
  if (movedOutResidentIds.length > 0) {
    const { error } = await db
      .from('property_residents')
      .update({ moved_out_at: settlementDate })
      .in('id', movedOutResidentIds)
      .eq('organization_id', orgId)
      .is('moved_out_at', null)
    if (error) return fail('property_residents.move_out', error)
    undo.unshift(() =>
      compensate('property_residents.move_out', { orgId, count: movedOutResidentIds.length }, () =>
        db.from('property_residents').update({ moved_out_at: null }).in('id', movedOutResidentIds).eq('organization_id', orgId),
      ),
    )
  }

  const endedTenancyIds: string[] = []
  for (const l of leases) {
    const leaseEnd = l.lease_end && l.lease_end.slice(0, 10) <= settlementDate ? l.lease_end : settlementDate
    const { error } = await db
      .from('tenancies')
      .update({ status: 'ended', lease_end: leaseEnd })
      .eq('id', l.id)
      .eq('organization_id', orgId)
    if (error) return fail('tenancies.end', error)
    endedTenancyIds.push(l.id)
    undo.unshift(() =>
      compensate('tenancies.end', { orgId, tenancyId: l.id }, () =>
        db.from('tenancies').update({ status: l.status, lease_end: l.lease_end }).eq('id', l.id).eq('organization_id', orgId),
      ),
    )
  }

  // 6. optionally list the buyers as owner residents (no invitation sent)
  const buyerResidentIds: Array<string | null> = buyers.map(() => null)
  if (input.addBuyersAsResidents) {
    const listed = new Set(residents.filter(isBuyer).map((r) => lower(r.email)))
    const toAdd = buyers
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => !(b.email && listed.has(lower(b.email))))
    if (toAdd.length > 0) {
      const { data: added, error } = await db
        .from('property_residents')
        .insert(
          toAdd.map(({ b, i }) => ({
            organization_id: orgId,
            property_id: propertyId,
            full_name: b.name,
            email: b.email,
            phone: b.phone,
            role: 'owner' as const,
            is_primary: i === 0,
            moved_in_at: settlementDate,
            notes: b.mailingAddress ? mailingNote(b.mailingAddress) : null,
            created_by: input.userId,
          })),
        )
        .select('id')
      const addedIds = ((added ?? []) as Array<{ id: string }>).map((r) => r.id)
      if (error || addedIds.length !== toAdd.length) {
        if (addedIds.length > 0) {
          await compensate('property_residents.add', { orgId, count: addedIds.length }, () =>
            db.from('property_residents').delete().in('id', addedIds).eq('organization_id', orgId),
          )
        }
        return fail('property_residents.add', error)
      }
      toAdd.forEach(({ i }, k) => (buyerResidentIds[i] = addedIds[k]!))
      undo.unshift(() =>
        compensate('property_residents.add', { orgId, count: addedIds.length }, () =>
          db.from('property_residents').delete().in('id', addedIds).eq('organization_id', orgId),
        ),
      )
    }
  }

  // 7. the audit row: ownership_changed, ids / counts / the date only
  const { data: ev, error: evErr } = await db
    .from('property_events')
    .insert({
      organization_id: orgId,
      property_id: propertyId,
      kind: 'ownership_changed',
      payload: {
        reason: 'sale',
        settlement_date: settlementDate,
        unit_id: unitId,
        closed_ownership_ids: closed,
        new_ownership_ids: newOwnershipIds,
        buyers: buyers.length,
        moved_out_residents: movedOutResidentIds.length,
        ended_leases: endedTenancyIds.length,
        buyers_listed: buyerResidentIds.filter(Boolean).length,
        tenants_carried: input.carryTenants,
        tenure_reset: tenureReset,
      },
      created_by: input.userId,
    })
    .select('id')
    .single<{ id: string }>()
  if (evErr || !ev) return fail('property_events.insert', evErr)

  console.info('[properties.sale] recorded', {
    orgId,
    propertyId,
    unitId,
    closed: closed.length,
    opened: newOwnershipIds.length,
    movedOut: movedOutResidentIds.length,
    leasesEnded: endedTenancyIds.length,
  })

  return {
    ok: true,
    data: {
      unitId,
      closedOwnershipIds: closed,
      newOwnershipIds,
      movedOutResidentIds,
      endedTenancyIds,
      buyerResidentIds,
      tenureReset,
      eventId: ev.id,
    },
  }
}
