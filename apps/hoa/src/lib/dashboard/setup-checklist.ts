/**
 * First-run setup checklist for the board dashboard (BL-008).
 *
 * Every step's completion is DERIVED from data on each render — never a
 * stored flag, which drifts the moment someone deletes their last property.
 *
 * Three states, not two. A count whose read failed is UNKNOWN: the card
 * says "Couldn't check" for that step and never counts it as done. The old
 * dashboard nudge threw on a failed count, which took the whole dashboard
 * to the error page over a setup hint; here each read fails on its own.
 *
 * Shape: `loadSetupChecklist` gathers counts (null = failed), and the pure
 * `buildSetupChecklist` turns them into steps. The split is what the unit
 * tests exercise.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'

type Db = SupabaseClient<Database>

export type SetupStepState = 'done' | 'todo' | 'unknown'

export const SETUP_CHECKLIST_KEYS = [
  'mailbox',
  'properties',
  'residents',
  'governing_docs',
  'dues',
  'board',
] as const

export type SetupChecklistKey = (typeof SETUP_CHECKLIST_KEYS)[number]

export interface SetupChecklistStep {
  key: SetupChecklistKey
  title: string
  description: string
  href: string
  cta: string
  /** Guide article the step's "How?" link opens (BL-070). guide:check verifies the id. */
  guide: string
  state: SetupStepState
}

export interface SetupChecklist {
  steps: SetupChecklistStep[]
  doneCount: number
  unknownCount: number
  total: number
  /** 0–100, from done steps only. */
  percent: number
  /** Every step is done. A step we couldn't check is not done. */
  complete: boolean
}

/**
 * Per-step counts. Each entry is a list of sources (a step can be satisfied
 * by either of two tables); `null` means that source's read failed.
 */
export interface SetupFacts {
  mailbox: Array<number | null>
  properties: Array<number | null>
  residents: Array<number | null>
  governingDocs: Array<number | null>
  dues: Array<number | null>
  board: Array<number | null>
}

/**
 * done   — any source reached `min` (real evidence, even if another failed)
 * unknown — nothing reached it and at least one source failed
 * todo   — every source answered and none reached it
 */
export function stepStateFrom(counts: Array<number | null>, min = 1): SetupStepState {
  if (counts.some((c) => c !== null && c >= min)) return 'done'
  if (counts.some((c) => c === null)) return 'unknown'
  return 'todo'
}

const STEP_COPY: Record<SetupChecklistKey, Omit<SetupChecklistStep, 'key' | 'state'>> = {
  mailbox: {
    title: 'Connect the HOA mailbox',
    description: 'Resident email flows in, filed under the right home.',
    // /inbox explains the next action for every role: admins get the
    // connect button, board members are told an admin has to do it.
    // /settings/mailbox is admin-only and would bounce a board member.
    href: '/inbox',
    cta: 'Connect',
    guide: 'start-board-admin',
  },
  properties: {
    title: 'Add your properties',
    description: 'Every address in the community.',
    href: '/properties/new',
    cta: 'Add properties',
    guide: 'setup-properties-residents',
  },
  residents: {
    title: 'Add owners and residents',
    description: 'Who lives where, so mail and dues match a person.',
    href: '/properties',
    cta: 'Add residents',
    guide: 'setup-properties-residents',
  },
  governing_docs: {
    title: 'Upload governing documents',
    description: 'CC&Rs and bylaws, so answers cite your own rules.',
    href: '/documents/governing',
    cta: 'Upload',
    guide: 'documents-governing-and-ask',
  },
  dues: {
    title: 'Set up dues',
    description: 'Generate this month’s dues so every home has a balance.',
    href: '/dues',
    cta: 'Set up dues',
    guide: 'dues-generate-monthly',
  },
  board: {
    title: 'Invite the board',
    description: 'Give the rest of the board their own login.',
    href: '/settings/members',
    cta: 'Invite',
    guide: 'members-invite-board',
  },
}

export function buildSetupChecklist(facts: SetupFacts): SetupChecklist {
  const states: Record<SetupChecklistKey, SetupStepState> = {
    mailbox: stepStateFrom(facts.mailbox),
    properties: stepStateFrom(facts.properties),
    residents: stepStateFrom(facts.residents),
    governing_docs: stepStateFrom(facts.governingDocs),
    dues: stepStateFrom(facts.dues),
    // The person who created the org is already a member; "invited the
    // board" means at least one more.
    board: stepStateFrom(facts.board, 2),
  }

  const steps = SETUP_CHECKLIST_KEYS.map((key) => ({ key, ...STEP_COPY[key], state: states[key] }))
  const doneCount = steps.filter((s) => s.state === 'done').length
  const unknownCount = steps.filter((s) => s.state === 'unknown').length
  const total = steps.length

  return {
    steps,
    doneCount,
    unknownCount,
    total,
    percent: Math.round((doneCount / total) * 100),
    complete: doneCount === total,
  }
}

/** Only a fully complete checklist can be dismissed. */
export function isChecklistDismissible(checklist: SetupChecklist): boolean {
  return checklist.complete
}

/** Cookie that hides a completed checklist, per org. */
export function setupDismissedCookie(orgId: string): string {
  return `hoa_setup_done_${orgId}`
}

// ─── Loader ────────────────────────────────────────────────────────────

interface CountResponse {
  count: number | null
  error: { code?: string; message: string } | null
}

/**
 * Runs one head-count; returns null on a soft PostgREST error OR a thrown
 * one. Logs ids and codes only.
 */
async function countOrNull(label: string, orgId: string, query: PromiseLike<CountResponse>): Promise<number | null> {
  try {
    const { count, error } = await query
    if (error) {
      console.error(`loadSetupChecklist: ${label} count failed`, { orgId, code: error.code, message: error.message })
      return null
    }
    return count ?? 0
  } catch (err) {
    console.error(`loadSetupChecklist: ${label} count threw`, {
      orgId,
      message: err instanceof Error ? err.message : String(err),
    })
    return null
  }
}

export async function loadSetupChecklist(db: Db, orgId: string): Promise<SetupChecklist> {
  const head = { count: 'exact', head: true } as const

  const [mailbox, hoaProperties, units, residents, ownerships, governingDocs, dues, members] = await Promise.all([
    countOrNull(
      'mailbox_accounts',
      orgId,
      db.from('mailbox_accounts').select('id', head).eq('organization_id', orgId).is('disconnected_at', null),
    ),
    // Two property models coexist (docs/SCHEMA_MAP.md): /properties writes
    // hoa_properties, the CSV import writes units. Either counts.
    countOrNull(
      'hoa_properties',
      orgId,
      db.from('hoa_properties').select('id', head).eq('org_id', orgId).is('deleted_at', null),
    ),
    countOrNull('units', orgId, db.from('units').select('id', head).eq('organization_id', orgId)),
    countOrNull(
      'property_residents',
      orgId,
      db
        .from('property_residents')
        .select('id', head)
        .eq('organization_id', orgId)
        .is('deleted_at', null)
        .is('moved_out_at', null),
    ),
    countOrNull(
      'ownerships',
      orgId,
      db.from('ownerships').select('id', head).eq('organization_id', orgId).is('valid_to', null),
    ),
    countOrNull(
      'governing_documents',
      orgId,
      db.from('governing_documents').select('id', head).eq('organization_id', orgId).is('superseded_at', null),
    ),
    countOrNull(
      'assessments',
      orgId,
      db.from('assessments').select('id', head).eq('organization_id', orgId).is('deleted_at', null),
    ),
    countOrNull('org_members', orgId, db.from('org_members').select('user_id', head).eq('org_id', orgId)),
  ])

  return buildSetupChecklist({
    mailbox: [mailbox],
    properties: [hoaProperties, units],
    residents: [residents, ownerships],
    governingDocs: [governingDocs],
    dues: [dues],
    board: [members],
  })
}
