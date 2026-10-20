// BL-117 Board turnover kit — the reads. The caller (the /settings/handover
// page) has already passed requireBoardOrAdmin for `orgId`; every query
// here is still scoped to that org explicitly.
//
// Two clients, on purpose:
//   - `db`, the signed-in board member's RLS client, for the board-readable
//     tables (associations, inbox threads, drafts, action items, tickets).
//   - `admin`, the service-role client, ONLY where RLS hides rows the board
//     is entitled to a summary of: other members' profiles (per-user RLS),
//     auth last sign-in, plaid_items (0061: never read by a user, because
//     the row holds the access token) and the mailbox/org billing rows. Each
//     admin read names its columns — access_token, sync cursors, the Stripe
//     customer id and anything in mailbox_account_secrets are never selected
//     or never leave this file except as a boolean.
//
// Relative imports only, matching lib/approvals-inbox/load.ts.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db'
import { loadOrFail } from '../load-or-fail'
import { paySettingsSecret, readZelleSettings } from '../pay-by-zelle'
import { EXPORT_TABLES } from '../data-export/tables'
import {
  buildAccess,
  buildConnections,
  buildOpenWork,
  type AccessSection,
  type Connection,
  type HandoverModel,
  type MailboxInput,
  type MemberRowInput,
  type OpenWorkSection,
  type PlaidItemInput,
  type ZelleState,
} from './model'

export type HandoverDb = SupabaseClient<Database>

export interface HandoverDeps {
  db: HandoverDb
  admin: HandoverDb
  orgId: string
  orgName: string
  now?: () => Date
  /** Defaults to the real signing secret; tests pass their own. */
  zelleSecret?: string | null
}

const OPEN_THREAD = ['needs_review', 'open', 'waiting']
const OPEN_ACTION = ['open', 'in_progress'] as const
const OPEN_TICKET = ['open', 'in_progress']

/**
 * Last sign-in per user from auth. Best effort: a failure costs the
 * "last sign-in" column (shown as "Not recorded"), never the member list.
 */
export async function loadLastSignIns(admin: HandoverDb, userIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>()
  await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data, error } = await admin.auth.admin.getUserById(id)
        out.set(id, error ? null : (data?.user?.last_sign_in_at ?? null))
      } catch {
        out.set(id, null)
      }
    }),
  )
  return out
}

export async function loadAccess(admin: HandoverDb, orgId: string): Promise<AccessSection | null> {
  const res = await loadOrFail(
    'handover: members',
    admin.from('org_members').select('user_id, role, joined_at, profile:profiles(email, full_name)').eq('org_id', orgId),
  )
  if (!res.ok) return null
  const rows = (res.data ?? []) as unknown as MemberRowInput[]
  const boardIds = rows.filter((r) => r.role === 'admin' || r.role === 'board').map((r) => r.user_id)
  return buildAccess(rows, await loadLastSignIns(admin, boardIds))
}

export async function loadConnections(deps: HandoverDeps, boardIds: ReadonlySet<string>): Promise<Connection[] | null> {
  const { db, admin, orgId } = deps
  const [mailbox, plaid, assoc, org] = await Promise.all([
    loadOrFail(
      'handover: mailbox',
      admin
        .from('mailbox_accounts')
        .select('connected_by, connected_at, sync_status, provider')
        .eq('organization_id', orgId)
        .is('disconnected_at', null)
        .order('connected_at', { ascending: false })
        .limit(1),
    ),
    loadOrFail(
      'handover: bank connections',
      admin
        .from('plaid_items')
        .select('id, institution_name, created_by, created_at, last_synced_at')
        .eq('organization_id', orgId)
        .eq('is_active', true),
    ),
    loadOrFail(
      'handover: association',
      db.from('associations').select('id, compliance_settings').eq('organization_id', orgId).order('name', { ascending: true }).limit(1),
    ),
    loadOrFail('handover: billing', admin.from('orgs').select('stripe_customer_id').eq('id', orgId).limit(1)),
  ])
  if (!mailbox.ok || !plaid.ok || !assoc.ok || !org.ok) return null

  const assocRow = ((assoc.data ?? []) as Array<{ id: string; compliance_settings: unknown }>)[0] ?? null
  let zelle: { state: ZelleState; updatedAt: string | null } = { state: 'no_association', updatedAt: null }
  if (assocRow) {
    const secret = deps.zelleSecret !== undefined ? deps.zelleSecret : paySettingsSecret()
    const read = readZelleSettings(assocRow.id, assocRow.compliance_settings, secret)
    zelle = read.state === 'configured' ? { state: 'configured', updatedAt: read.settings.updatedAt } : { state: read.state, updatedAt: null }
  }
  const orgRow = ((org.data ?? []) as Array<{ stripe_customer_id: string | null }>)[0] ?? null

  return buildConnections(
    {
      mailbox: ((mailbox.data ?? []) as MailboxInput[])[0] ?? null,
      plaidItems: (plaid.data ?? []) as PlaidItemInput[],
      zelle,
      hasStripeCustomer: Boolean(orgRow?.stripe_customer_id),
    },
    boardIds,
  )
}

export async function loadOpenWork(db: HandoverDb, orgId: string, boardIds: ReadonlySet<string>): Promise<OpenWorkSection | null> {
  const [threads, actions, tickets, drafts] = await Promise.all([
    loadOrFail(
      'handover: assigned threads',
      db.from('inbox_threads').select('assigned_to').eq('organization_id', orgId).in('status', OPEN_THREAD).not('assigned_to', 'is', null),
    ),
    loadOrFail(
      'handover: action items',
      db
        .from('meeting_action_items')
        .select('assignee_user_id, ticket_id')
        .eq('org_id', orgId)
        .in('status', [...OPEN_ACTION])
        .not('assignee_user_id', 'is', null),
    ),
    loadOrFail(
      'handover: open tickets',
      db.from('tickets').select('submitted_by').eq('organization_id', orgId).in('status', OPEN_TICKET).is('deleted_at', null),
    ),
    loadOrFail(
      'handover: drafts awaiting approval',
      db.from('inbox_drafts').select('created_by').eq('organization_id', orgId).eq('status', 'draft'),
    ),
  ])
  if (!threads.ok || !actions.ok || !tickets.ok || !drafts.ok) return null
  return buildOpenWork(
    {
      threads: (threads.data ?? []) as Array<{ assigned_to: string | null }>,
      actionItems: (actions.data ?? []) as Array<{ assignee_user_id: string | null; ticket_id: string | null }>,
      tickets: (tickets.data ?? []) as Array<{ submitted_by: string }>,
      drafts: (drafts.data ?? []) as Array<{ created_by: string | null }>,
    },
    boardIds,
  )
}

/**
 * The whole kit. Members load first (every other section needs to know
 * who is on the board); the other two sections then load in parallel. A
 * section that fails is `null` and the rest still render.
 */
export async function loadHandover(deps: HandoverDeps): Promise<HandoverModel> {
  const now = deps.now ?? (() => new Date())
  const access = await loadAccess(deps.admin, deps.orgId)
  const boardIds = new Set((access?.board ?? []).map((m) => m.userId))
  // Without the member list, ownership can't be attributed: every owner
  // would read as "former member". Report those sections as not loaded.
  const [connections, openWork] = access
    ? await Promise.all([loadConnections(deps, boardIds), loadOpenWork(deps.db, deps.orgId, boardIds)])
    : [null, null]
  return {
    generatedAt: now().toISOString(),
    orgName: deps.orgName,
    access,
    connections,
    openWork,
    exportTableCount: EXPORT_TABLES.length,
  }
}
