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
//   - the resident has no home linked to an association: there is no switch
//     of theirs to read (SEC-003 — never "the org's first association");
//   - the board has not switched it on for EVERY one of the resident's own
//     associations, or a setting can't be read or verified (settings.ts:
//     missing reads OFF, SEC-002);
//   - no model is configured on this server.

import { getCurrentOrg } from '@/lib/orgs'
import { getResidentActor } from '@/lib/impersonation'
import { getEffectiveRoleInOrg } from '@/lib/role-override'
import { getResidentUnits } from '@/lib/resident'
import { paySettingsSecret } from '@/lib/pay-by-zelle'
import { residentAssistantOn } from './settings'
import type { ResidentScope } from './reads'

export type ResidentAssistantOff =
  | 'no_org'
  | 'impersonating'
  | 'not_resident'
  | 'no_association'
  | 'switched_off'
  | 'not_configured'

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

  // The resident's OWN associations only.
  if (fromUnits.length === 0) return { on: false, reason: 'no_association' }
  const { data, error } = await actor.client
    .from('associations')
    .select('id, compliance_settings')
    .eq('organization_id', org.id)
    .in('id', fromUnits)
  if (error) return { on: false, reason: 'switched_off' }
  const rows = (data ?? []) as Array<{ id: string; compliance_settings: unknown }>
  const secret = paySettingsSecret()
  // Every one must be read AND switched on: a row RLS hides is not ON.
  const onById = new Map(rows.map((r) => [r.id, residentAssistantOn(r.id, r.compliance_settings, secret)]))
  if (!fromUnits.every((id) => onById.get(id) === true)) {
    return { on: false, reason: 'switched_off' }
  }

  return {
    on: true,
    associationIds: fromUnits,
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
