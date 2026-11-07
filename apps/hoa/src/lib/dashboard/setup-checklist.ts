/**
 * THE setup checklist (BL-008, BL-127): one model, shown on the dashboard
 * ("Get your HOA set up") and on the sign-up page (/onboarding/setup).
 * There used to be two — 6 steps here, 4 there — that disagreed with each
 * other and with the guide.
 *
 * Every step's completion is DERIVED from data on each render — never a
 * stored flag, which drifts the moment someone deletes their last property.
 * And "done" means the real thing: "Invite the board" needs another board
 * member or admin (a resident invite doesn't count), "association and
 * books" needs the books actually open, "resident payments" needs Zelle
 * details residents can actually see.
 *
 * Three states, not two. A count whose read failed is UNKNOWN: the card
 * says "Couldn't check" for that step and never counts it as done.
 *
 * Optional steps (bank, mailbox) show progress but don't block hiding the
 * card: a board can reconcile by hand, and a mailbox on Outlook can't be
 * connected yet.
 *
 * Shape: `loadSetupChecklist` gathers counts (null = failed), and the pure
 * `buildSetupChecklist` turns them into steps. The split is what the unit
 * tests exercise.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { createAdminClient } from '@homeowner-portal/db'
import { readCommunityLocation } from '@/lib/association-location'
import { loadOwnersWithoutAccount, type Db as OwnerInvitesDb } from '@/lib/owner-invites'
import { paySettingsSecret, readZelleSettings } from '@/lib/pay-by-zelle'

type Db = SupabaseClient<Database>

export type SetupStepState = 'done' | 'todo' | 'unknown'

/** In the order a new board should do them. */
export const SETUP_CHECKLIST_KEYS = [
  'association',
  'properties',
  'residents',
  'board',
  'invite_owners',
  'dues',
  'payments',
  'governing_docs',
  'bank',
  'mailbox',
] as const

export type SetupChecklistKey = (typeof SETUP_CHECKLIST_KEYS)[number]

/** Steps that don't block hiding the card. */
export const OPTIONAL_SETUP_KEYS: ReadonlySet<SetupChecklistKey> = new Set<SetupChecklistKey>(['bank', 'mailbox'])

export interface SetupStepLink {
  href: string
  label: string
}

export interface SetupChecklistStep {
  key: SetupChecklistKey
  title: string
  description: string
  href: string
  cta: string
  /** A second way to do the step (its own link, beside the main one). */
  secondary?: SetupStepLink
  /** Guide article the step's "How?" link opens (BL-070). guide:check verifies the id. */
  guide: string
  /** Doesn't block hiding the card. */
  optional: boolean
  state: SetupStepState
}

export interface SetupChecklist {
  steps: SetupChecklistStep[]
  doneCount: number
  unknownCount: number
  total: number
  /** Required steps only. */
  requiredDone: number
  requiredTotal: number
  /** 0–100, from done steps only. */
  percent: number
  /** Every REQUIRED step is done. A step we couldn't check is not done. */
  complete: boolean
}

/**
 * Per-step counts. Each entry is a list of sources (a step can be satisfied
 * by either of two tables); `null` means that source's read failed.
 */
export interface SetupFacts {
  /** The org's associations. */
  association: Array<number | null>
  /** Open fiscal periods: "Open the books" has run. */
  books: Array<number | null>
  properties: Array<number | null>
  residents: Array<number | null>
  /** org_members with a BOARD role (admin or board) — residents don't count. */
  board: Array<number | null>
  /**
   * Owners on the roster with an email and no account yet (the People page's
   * "Owners not invited yet"). null = the read failed. 0 means done, and so
   * does a roster where no owner has an email.
   */
  ownersToInvite: number | null
  dues: Array<number | null>
  /** 1 when the community's city and ZIP are both saved, else 0. */
  location: Array<number | null>
  /** 1 when residents can see verified Zelle details, else 0. */
  payments: Array<number | null>
  governingDocs: Array<number | null>
  bank: Array<number | null>
  mailbox: Array<number | null>
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

/** A step that needs several things: done only when all are; todo as soon as one is known missing. */
export function allOf(...states: SetupStepState[]): SetupStepState {
  if (states.every((s) => s === 'done')) return 'done'
  if (states.some((s) => s === 'todo')) return 'todo'
  return 'unknown'
}

/**
 * The owners step: done when no owner with an email is still waiting for an
 * invitation (invited owners and owners who joined both drop out of the
 * count). A roster with no emails at all is also 0, so it reads done and the
 * printable notice stays on offer as the other route.
 */
export function ownersInvitedState(ownersToInvite: number | null): SetupStepState {
  if (ownersToInvite === null) return 'unknown'
  return ownersToInvite === 0 ? 'done' : 'todo'
}

/**
 * The properties step. Was shared word for word with the old sign-up
 * checklist (BL-072); now there is only one checklist. A spreadsheet goes
 * to the board's own import (P4), never to support.
 */
export const PROPERTIES_STEP_COPY = {
  title: 'Add your properties',
  description: 'Every address in the community. Type them in, or import a spreadsheet such as a CINC Systems export.',
  href: '/properties/new',
  cta: 'Add properties',
  secondary: { href: '/properties/import', label: 'Import a spreadsheet' },
} as const

type StepCopy = Omit<SetupChecklistStep, 'key' | 'state' | 'optional'>

const STEP_COPY: Record<SetupChecklistKey, StepCopy> = {
  association: {
    title: 'Set up your association and books',
    description:
      'The association your homes and dues belong to, with its funds, chart of accounts and fiscal year. Add the community’s city and ZIP too, so house photos show for street-only addresses.',
    // Shows "Set up your association" (no association yet) or "Open the
    // books" (association, no books) — whichever is missing.
    href: '/accounting/periods',
    cta: 'Set up',
    // BL-176: the state and type decide which law applies; they were only
    // ever chosen once, in the create form.
    // The same page also holds the community's city and ZIP (item 2 of
    // round 30): without them a house photo can't be found for an address
    // that is only a street.
    secondary: { href: '/settings/association', label: 'Confirm your state, type, city and ZIP' },
    guide: 'dues-generate-monthly',
  },
  properties: { ...PROPERTIES_STEP_COPY, guide: 'setup-properties-residents' },
  residents: {
    title: 'Add owners and residents',
    description: 'Who lives where, so mail and dues match a person.',
    href: '/properties',
    cta: 'Add residents',
    guide: 'setup-properties-residents',
  },
  board: {
    title: 'Invite the board',
    description: 'Give at least one other board member their own login. Inviting a resident doesn’t count.',
    href: '/settings/members',
    cta: 'Invite',
    guide: 'members-invite-board',
  },
  invite_owners: {
    title: 'Invite your owners',
    description:
      'Send each owner with an email a link to join the portal. For owners with no email, print the “How to join” notice and hand it out.',
    href: '/settings/members#invite-owners',
    cta: 'Invite owners',
    secondary: { href: '/people/join-notice', label: 'Print the “How to join” notice' },
    guide: 'members-invite-owners',
  },
  dues: {
    title: 'Set up dues',
    description: 'Generate this month’s dues so every home has a balance.',
    href: '/dues',
    cta: 'Set up dues',
    guide: 'dues-generate-monthly',
  },
  payments: {
    title: 'Set up resident payments',
    description: 'Add the HOA’s Zelle details so owners can pay. Until then they see “Online payments aren’t set up yet.”',
    href: '/settings/payments',
    cta: 'Set up payments',
    guide: 'settings-resident-payments',
  },
  governing_docs: {
    title: 'Upload governing documents',
    description: 'CC&Rs and bylaws, so answers cite your own rules.',
    href: '/documents/governing',
    cta: 'Upload',
    guide: 'documents-governing-and-ask',
  },
  bank: {
    title: 'Connect the bank',
    description: 'Link the HOA’s bank so deposits match dues. Optional: you can reconcile by hand instead.',
    href: '/accounting/bank',
    cta: 'Connect',
    guide: 'accounting-bank-reconcile',
  },
  mailbox: {
    title: 'Connect the HOA mailbox',
    description: 'Resident email flows in, filed under the right home. Optional; Google mailboxes only for now.',
    // /inbox explains the next action for every role: admins get the
    // connect button, board members are told an admin has to do it.
    // /settings/mailbox is admin-only and would bounce a board member.
    href: '/inbox',
    cta: 'Connect',
    guide: 'inbox-connect-mailbox',
  },
}

export function buildSetupChecklist(facts: SetupFacts): SetupChecklist {
  const states: Record<SetupChecklistKey, SetupStepState> = {
    association: allOf(stepStateFrom(facts.association), stepStateFrom(facts.books), stepStateFrom(facts.location)),
    properties: stepStateFrom(facts.properties),
    residents: stepStateFrom(facts.residents),
    // The person who created the org is already an admin; "invited the
    // board" means at least one more board member or admin.
    board: stepStateFrom(facts.board, 2),
    invite_owners: ownersInvitedState(facts.ownersToInvite),
    dues: stepStateFrom(facts.dues),
    payments: stepStateFrom(facts.payments),
    governing_docs: stepStateFrom(facts.governingDocs),
    bank: stepStateFrom(facts.bank),
    mailbox: stepStateFrom(facts.mailbox),
  }

  const steps: SetupChecklistStep[] = SETUP_CHECKLIST_KEYS.map((key) => ({
    key,
    ...STEP_COPY[key],
    optional: OPTIONAL_SETUP_KEYS.has(key),
    state: states[key],
  }))
  const doneCount = steps.filter((s) => s.state === 'done').length
  const unknownCount = steps.filter((s) => s.state === 'unknown').length
  const required = steps.filter((s) => !s.optional)
  const requiredDone = required.filter((s) => s.state === 'done').length
  const total = steps.length

  return {
    steps,
    doneCount,
    unknownCount,
    total,
    requiredDone,
    requiredTotal: required.length,
    percent: Math.round((doneCount / total) * 100),
    complete: requiredDone === required.length,
  }
}

/** Only a checklist whose required steps are all done can be dismissed. */
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

function logFailed(label: string, orgId: string, code: string | undefined): void {
  // Ids and codes only.
  console.error(`loadSetupChecklist: ${label} failed`, { orgId, code: code ?? 'unknown' })
}

/** Runs one head-count; returns null on a soft PostgREST error OR a thrown one. */
async function countOrNull(label: string, orgId: string, query: PromiseLike<CountResponse>): Promise<number | null> {
  try {
    const { count, error } = await query
    if (error) {
      logFailed(`${label} count`, orgId, error.code)
      return null
    }
    return count ?? 0
  } catch (err) {
    logFailed(`${label} count`, orgId, err instanceof Error ? err.name : undefined)
    return null
  }
}

/**
 * One read of the org's primary association (first by name, the one
 * /settings/payments and /settings/association edit), two facts from it:
 *   payments: 1 when residents can see Zelle details signed by the board's save
 *   location: 1 when both the community's city and ZIP are saved
 * Each is 0 when not or when there is no association, null when the read failed.
 */
async function primaryAssociationFacts(
  db: Db,
  orgId: string,
): Promise<{ payments: number | null; location: number | null }> {
  const failed = { payments: null, location: null }
  try {
    const { data, error } = await db
      .from('associations')
      .select('id, compliance_settings')
      .eq('organization_id', orgId)
      .order('name', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) {
      logFailed('association read', orgId, error.code)
      return failed
    }
    const row = data as { id: string; compliance_settings: unknown } | null
    if (!row) return { payments: 0, location: 0 }
    const state = readZelleSettings(row.id, row.compliance_settings, paySettingsSecret()).state
    const loc = readCommunityLocation(row.compliance_settings)
    return {
      payments: state === 'configured' || state === 'checks_only' ? 1 : 0,
      location: loc.city && loc.zip ? 1 : 0,
    }
  } catch (err) {
    logFailed('association read', orgId, err instanceof Error ? err.name : undefined)
    return failed
  }
}

/**
 * Owners with an email and no account yet: the same number the People page
 * shows as "Owners not invited yet". Needs the service role (profiles are
 * per-user under RLS); the dashboard and setup page are board/admin only.
 */
async function ownersWaitingForInvite(orgId: string): Promise<number | null> {
  try {
    const owners = await loadOwnersWithoutAccount(createAdminClient() as unknown as OwnerInvitesDb, orgId)
    return owners ? owners.length : null
  } catch (err) {
    logFailed('owners read', orgId, err instanceof Error ? err.name : undefined)
    return null
  }
}

export async function loadSetupChecklist(db: Db, orgId: string): Promise<SetupChecklist> {
  const head = { count: 'exact', head: true } as const

  const [
    associations,
    openPeriods,
    hoaProperties,
    units,
    residents,
    ownerships,
    boardMembers,
    dues,
    assoc,
    ownersToInvite,
    governingDocs,
    bank,
    mailbox,
  ] = await Promise.all([
    countOrNull('associations', orgId, db.from('associations').select('id', head).eq('organization_id', orgId)),
    countOrNull(
      'fiscal_periods',
      orgId,
      db.from('fiscal_periods').select('id', head).eq('organization_id', orgId).eq('status', 'open'),
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
    // Board roles only: inviting a resident is not "inviting the board".
    countOrNull(
      'org_members',
      orgId,
      db.from('org_members').select('user_id', head).eq('org_id', orgId).in('role', ['admin', 'board']),
    ),
    countOrNull(
      'assessments',
      orgId,
      db.from('assessments').select('id', head).eq('organization_id', orgId).is('deleted_at', null),
    ),
    primaryAssociationFacts(db, orgId),
    ownersWaitingForInvite(orgId),
    countOrNull(
      'governing_documents',
      orgId,
      db.from('governing_documents').select('id', head).eq('organization_id', orgId).is('superseded_at', null),
    ),
    countOrNull(
      'bank_accounts',
      orgId,
      db.from('bank_accounts').select('id', head).eq('organization_id', orgId).eq('is_active', true),
    ),
    countOrNull(
      'mailbox_accounts',
      orgId,
      db.from('mailbox_accounts').select('id', head).eq('organization_id', orgId).is('disconnected_at', null),
    ),
  ])

  return buildSetupChecklist({
    association: [associations],
    books: [openPeriods],
    properties: [hoaProperties, units],
    residents: [residents, ownerships],
    board: [boardMembers],
    ownersToInvite,
    dues: [dues],
    location: [assoc.location],
    payments: [assoc.payments],
    governingDocs: [governingDocs],
    bank: [bank],
    mailbox: [mailbox],
  })
}
