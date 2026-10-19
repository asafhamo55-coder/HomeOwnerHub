import 'server-only'

// BL-096 — is the resident assistant on for THIS signed-in resident, and
// the scope its tools run in. Used by /resident/ask (which chat to show)
// and /api/ai/resident-assistant (the gate + the tool scope).
//
// Off, in which case /resident/ask keeps today's Ask the Docs, when:
//   - an admin is impersonating an owner: the actor's client is then
//     service role, and the assistant's tools must only ever run on the
//     resident's own RLS-bound client;
//   - the viewer is not (effectively) a resident;
//   - the board switched it off for the resident's association(s), or the
//     setting can't be read or verified (settings.ts);
//   - no model is configured on this server.

import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { getResidentUnits } from '@/lib/resident'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { residentAssistantOn } from './settings'
import type { ResidentScope } from './reads'

export type ResidentAssistantOff = 'no_org' | 'impersonating' | 'not_resident' | 'switched_off' | 'not_configured'

export type ResidentAssistantGate =
  | { on: true; scope: ResidentScope; associationIds: string[] }
  | { on: false; reason: ResidentAssistantOff }

export async function resolveResidentAssistant(): Promise<ResidentAssistantGate> {
  const org = await getCurrentOrg()
  if (!org) return { on: false, reason: 'no_org' }
  const actor = await getResidentActor()
  if (actor.impersonating) return { on: false, reason: 'impersonating' }
  if ((await getEffectiveRoleInOrg(org.id)) !== 'resident') return { on: false, reason: 'not_resident' }
  if (!process.env.AI_API_KEY) return { on: false, reason: 'not_configured' }

  const units = await getResidentUnits()
  const fromUnits = [...new Set(units.map((u) => u.association_id).filter((id): id is string => !!id))]

  // The resident's own associations; with no linked home, the org's first
  // (the one the board's Settings screen saves to).
  let q = actor.client.from('associations').select('id, compliance_settings').eq('organization_id', org.id)
  q = fromUnits.length > 0 ? q.in('id', fromUnits) : q.order('name', { ascending: true }).limit(1)
  const { data, error } = await q
  if (error) return { on: false, reason: 'switched_off' }
  const rows = (data ?? []) as Array<{ id: string; compliance_settings: unknown }>
  const secret = paySettingsSecret()
  if (!rows.every((r) => residentAssistantOn(r.id, r.compliance_settings, secret))) {
    return { on: false, reason: 'switched_off' }
  }

  return {
    on: true,
    associationIds: rows.map((r) => r.id),
    scope: {
      db: actor.client,
      orgId: org.id,
      userId: actor.id,
      email: actor.email,
      units: units.map((u) => ({
        unit_id: u.unit_id,
        unit_number: u.unit_number,
        address: u.address,
        association_id: u.association_id,
        association_name: u.association_name,
        association_time_zone: u.association_time_zone ?? null,
        charges_from: u.charges_from ?? null,
      })),
    },
  }
}
