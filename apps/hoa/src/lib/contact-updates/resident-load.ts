// PR-10 resident side: the signed-in resident's own contact details, per
// home, read with THEIR client (RLS shows them only their own rows:
// property_residents on their sign-in email, ownerships/tenancies linked
// to their account, their own tickets). While an admin impersonates, the
// client is service-role, so every read is confined to actor.id/email and
// the impersonation org.
//
// Not 'use server' — returns plain data to the account page and the
// request action.

import { getResidentActor, type ResidentActor } from '@/lib/impersonation'
import { exactIlike } from '@/lib/impersonation-target'
import { getResidentUnits, type ResidentUnit } from '@/lib/resident'
import { loadOrFail, tryLoad } from '@/lib/load-or-fail'
import { getCurrentOrg } from '@/lib/orgs'
import { propertyIdsForUnits } from '@/lib/properties/resolve'
import {
  CONTACT_SUBJECT,
  buildMyContact,
  parseTrustedContactRequest,
  type MyContact,
  type MyOwnershipRow,
  type MyResidentRow,
  type MyTenancyRow,
  type PendingRequest,
} from './model'

export interface MyContacts {
  actor: ResidentActor
  units: ResidentUnit[]
  homes: MyContact[]
  /** The sign-in email requests are filed under. */
  signInEmail: string | null
}

/** `{ ok: false }` = a read failed: the page says so instead of showing blanks. */
export async function loadMyContacts(): Promise<{ ok: true; data: MyContacts } | { ok: false }> {
  const actor = await getResidentActor()
  const units = await getResidentUnits()
  const signInEmail = actor.email?.trim().toLowerCase() || null
  if (units.length === 0 || (!actor.id && !signInEmail)) {
    return { ok: true, data: { actor, units, homes: [], signInEmail } }
  }
  const db = actor.client
  const org = actor.orgId
  const unitIds = units.map((u) => u.unit_id)


  let resQ = signInEmail
    ? db
        .from('property_residents' as never)
        .select('id, property_id, email, phone, notes')
        .ilike('email' as never, exactIlike(signInEmail))
        .is('moved_out_at' as never, null)
        .is('deleted_at' as never, null)
    : null
  if (resQ && org) resQ = resQ.eq('organization_id' as never, org as never)

  let ownQ = actor.id
    ? db.from('ownerships').select('id, unit_id, owner_email, owner_phone').eq('owner_user_id', actor.id).is('valid_to', null)
    : null
  if (ownQ && org) ownQ = ownQ.eq('organization_id', org)

  let tenQ = actor.id
    ? db.from('tenancies').select('id, unit_id, tenant_email, tenant_phone').eq('tenant_user_id', actor.id).eq('status', 'active')
    : null
  if (tenQ && org) tenQ = tenQ.eq('organization_id', org)

  let tickQ = actor.id
    ? db
        .from('tickets' as never)
        .select('id, unit_id, subject, description, status, created_at')
        .eq('submitted_by' as never, actor.id as never)
        .eq('subject' as never, CONTACT_SUBJECT as never)
        .in('status' as never, ['open', 'in_progress'] as never)
        .is('deleted_at' as never, null)
    : null
  if (tickQ && org) tickQ = tickQ.eq('organization_id' as never, org as never)

  const empty = Promise.resolve({ ok: true as const, data: [] as unknown[], count: null })
  const [unitRows, resRows, ownRows, tenRows, tickRows] = await Promise.all([
    // Unit → property through the bridge module; the org is the
    // impersonation org, else the selected one (RLS bounds it too).
    tryLoad('contact: units', async () => propertyIdsForUnits(db, org ?? (await getCurrentOrg())?.id ?? '', unitIds)),
    resQ ? loadOrFail('contact: resident rows', resQ) : empty,
    ownQ ? loadOrFail('contact: ownerships', ownQ) : empty,
    tenQ ? loadOrFail('contact: leases', tenQ) : empty,
    tickQ ? loadOrFail('contact: waiting requests', tickQ.order('created_at' as never, { ascending: false })) : empty,
  ])
  if (!unitRows.ok || !resRows.ok || !ownRows.ok || !tenRows.ok || !tickRows.ok) return { ok: false }

  const propertyOf = unitRows.data as Map<string, string>
  const pendingByUnit = new Map<string, PendingRequest>()
  for (const t of (tickRows.data ?? []) as Array<{ id: string; unit_id: string | null; subject: string; description: string; created_at: string }>) {
    // These are the viewer's OWN tickets (submitted_by = them), never a
    // board member's, so an "Emailed in by" claim is never honoured here.
    const request = parseTrustedContactRequest(t.subject, t.description, false)
    if (!request || !t.unit_id || pendingByUnit.has(t.unit_id)) continue
    pendingByUnit.set(t.unit_id, { ticketId: t.id, createdAt: t.created_at, request })
  }

  const homes = units.map((u) =>
    buildMyContact({
      unit: u,
      propertyId: propertyOf.get(u.unit_id) ?? null,
      residents: (resRows.data ?? []) as MyResidentRow[],
      ownerships: (ownRows.data ?? []) as MyOwnershipRow[],
      tenancies: (tenRows.data ?? []) as MyTenancyRow[],
      pending: pendingByUnit.get(u.unit_id) ?? null,
    }),
  )
  return { ok: true, data: { actor, units, homes, signInEmail } }
}
