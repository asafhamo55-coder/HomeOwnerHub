// Community Q&A tools.
//
// Each entry pairs a JSON-schema "definition" that the LLM sees with an
// "execute" function that the agent calls. Tools are read-only and run
// through the user-bound Supabase client, so RLS still applies — even
// if the LLM hallucinates a bad arg it can't see other orgs' data.
//
// To add a new tool: append a TOOL entry below + register it in the
// TOOLS array at the bottom. The agent picks it up automatically.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { queryGoverningDocs } from '@homeowner-portal/workflows/W1'
import { readAll } from '@/lib/supabase/read-all'
import { calendarDaysBetween, todayIn } from '@/lib/association-time'
import { orgTimeZone } from '@/lib/association-time-server'
import type { ContactVault } from './contact-placeholders'

// Db matches what getSupabaseServerClient() returns. We keep the
// Database generic so .from('assessments').select(...) is fully typed
// inside the tool bodies below.
type Db = SupabaseClient<Database>

export interface ToolDefinition {
  name: string
  description: string
  /** JSON Schema describing the input args, OpenAI tool-call shape. */
  parameters: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ToolContext {
  /** User-bound supabase client (RLS enforced). */
  db: Db
  orgId: string
  /** Whether the caller's role may see owner email / phone (board and admin
   *  do: hoa_properties_select and the property page). Explicit so a future
   *  resident-facing caller can't inherit it. Even when true the model gets
   *  only placeholder tokens (BL-062); see contactVault. */
  canSeeOwnerContact: boolean
  /** Per-request store for owner contact. Tools put the real value here and
   *  give the model a token like [OWNER_EMAIL_1]; the route swaps tokens in
   *  the final answer for real values only for a caller who may see them. */
  contactVault: ContactVault
  /** Optional — narrows governing-docs search to one association when
   *  the question is clearly about a specific community within a
   *  multi-association org. Null = search across all of org's docs. */
  associationId?: string | null
}

export interface Tool<C = ToolContext> {
  def: ToolDefinition
  /** Returns a camelCase result (money in *Cents) that is fed to the model.
   *  Throws ToolFailure — never free text — when it cannot answer. */
  execute: (args: Record<string, unknown>, ctx: C) => Promise<unknown>
  /** The part of the result the HTTP response may carry. Default: all of it. */
  toPublic?: (result: unknown) => unknown
}

/**
 * The only failure vocabulary a tool has (RC-2). The model and the HTTP
 * response see `{ failed: true, code }`; a thrown DB/W1 message never
 * reaches either, because it names tables and columns and can embed row
 * values. The DB code is kept for the log line only.
 */
export type ToolErrorCode = 'lookup_failed' | 'docs_unavailable' | 'invalid_args' | 'unknown_tool' | 'budget'

export class ToolFailure extends Error {
  readonly dbCode: string | undefined
  constructor(
    readonly code: ToolErrorCode,
    cause?: unknown,
  ) {
    super(code)
    this.name = 'ToolFailure'
    const c = (cause as { code?: unknown } | undefined)?.code
    this.dbCode = typeof c === 'string' || typeof c === 'number' ? String(c) : undefined
  }
}

export interface ToolFailed {
  failed: true
  code: ToolErrorCode
}

export function toolFailed(code: ToolErrorCode): ToolFailed {
  return { failed: true, code }
}

export function isToolFailed(v: unknown): v is ToolFailed {
  return !!v && typeof v === 'object' && (v as { failed?: unknown }).failed === true
}

// ─── count_units_by_tenure ──────────────────────────────────────────

const countUnitsByTenure: Tool = {
  def: {
    name: 'count_units_by_tenure',
    description:
      "Counts properties in the community by occupancy: owner_occupied vs leased vs unknown. Use for questions like 'how many properties are rented' or 'what's the lease ratio'.",
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  async execute(_args, { db, orgId }) {
    // Paged to the end, and a failed read throws (BL-047): a single read
    // stopped at PostgREST's 1000-row cap, and an ignored error answered
    // "0 properties". The agent turns a throw into a tool error.
    const data = await readAll<{ tenure: string | null }>(
      (from, to) =>
        db
          .from('hoa_properties')
          .select('id, tenure')
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to) as never,
      toolReadFailed(),
    )
    const counts = { ownerOccupied: 0, leased: 0, unknown: 0, total: 0 }
    for (const r of data) {
      counts.total += 1
      if (r.tenure === 'owner_occupied') counts.ownerOccupied += 1
      else if (r.tenure === 'leased') counts.leased += 1
      else counts.unknown += 1
    }
    return counts
  },
}

// ─── list_overdue_dues ──────────────────────────────────────────────

const listOverdueDues: Tool = {
  def: {
    name: 'list_overdue_dues',
    description:
      "Lists assessments past their due_date that aren't paid/waived/written_off. Returns up to `limit` rows. Use for 'who's behind on dues', 'show me delinquencies'.",
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
      },
    },
  },
  async execute(args, { db, orgId }) {
    const limit = clampInt(args.limit, 1, 100, 25)
    // The association's today (BL-043): due_date is a calendar date, and
    // "overdue" means due before today THERE, not on the UTC calendar.
    const today = todayIn(await orgTimeZone(db, orgId))
    const { data, error } = await db
      .from('assessments')
      .select(
        'id, amount, due_date, status, unit:units(address_line1, lot_number), payments(amount)',
      )
      .eq('organization_id', orgId)
      .is('deleted_at', null)
      .lt('due_date', today)
      .neq('status', 'paid')
      .neq('status', 'waived')
      .neq('status', 'written_off')
      .order('due_date', { ascending: true })
      .limit(limit)
    // An ignored error answered "nobody is overdue" — a wrong fact.
    if (error) throw new ToolFailure('lookup_failed', error)
    type Row = {
      id: string
      amount: number | string
      due_date: string
      status: string
      unit: { address_line1: string | null; lot_number: string | null } | null
      payments: { amount: number | string }[]
    }
    return ((data ?? []) as unknown as Row[]).map((r) => {
      // numeric dollars → integer cents here, once (RC-11), before any
      // arithmetic, so 125.10 - 25.05 is 10005 and not 100.04999….
      const dueCents = dollarsToCents(r.amount)
      const paidCents = (r.payments ?? []).reduce((s, p) => s + dollarsToCents(p.amount), 0)
      const daysOverdue = Math.max(
        0,
        calendarDaysBetween(r.due_date, today) || 0,
      )
      return {
        address: r.unit?.address_line1 ?? '(unknown)',
        lotNumber: r.unit?.lot_number ?? null,
        amountDueCents: dueCents,
        amountRemainingCents: Math.max(dueCents - paidCents, 0),
        dueDate: r.due_date,
        daysOverdue,
        status: r.status,
      }
    })
  },
}

// ─── get_unit_owner ─────────────────────────────────────────────────

const getUnitOwner: Tool = {
  def: {
    name: 'get_unit_owner',
    description:
      "Looks up the current owner(s) of a property by address (partial match allowed). Returns owner name, whether contact is on file, and — for callers allowed to see it — email/phone as placeholder tokens like [OWNER_EMAIL_1] that the portal fills in. Use for 'who owns 829 Pistace Ct'.",
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Full or partial street address.' },
      },
      required: ['address'],
    },
  },
  async execute(args, { db, orgId, canSeeOwnerContact, contactVault }) {
    const addr = String(args.address ?? '').trim().slice(0, 200)
    if (!addr) throw new ToolFailure('invalid_args')
    const { data: properties, error } = await db
      .from('hoa_properties')
      .select('id, address, owner_name, owner_email, owner_phone, tenure')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .ilike('address', `%${addr.replace(/[%_\\]/g, '\\$&')}%`)
      .limit(5)
    if (error) throw new ToolFailure('lookup_failed', error)
    if (!properties || properties.length === 0) return { matches: [] }
    return {
      matches: (properties as Array<{
        id: string
        address: string
        owner_name: string | null
        owner_email: string | null
        owner_phone: string | null
        tenure: string | null
      }>).map((p) => {
        const email = p.owner_email?.trim() || null
        const phone = p.owner_phone?.trim() || null
        // BL-062: the model gets a token, never the value. Only a caller who
        // may see contact gets tokens at all; the route fills them in.
        return {
          address: p.address,
          ownerName: p.owner_name,
          contactOnFile: !!(email || phone),
          ...(canSeeOwnerContact
            ? {
                ownerEmail: email ? contactVault.token('email', email) : null,
                ownerPhone: phone ? contactVault.token('phone', phone) : null,
              }
            : {}),
          tenure: p.tenure,
        }
      }),
    }
  },
  // The response's data-sources log carries neither contact nor its tokens.
  toPublic(result) {
    const r = result as { matches: Array<{ address: string; ownerName: string | null; tenure: string | null }> }
    return {
      matches: r.matches.map((m) => ({ address: m.address, ownerName: m.ownerName, tenure: m.tenure })),
    }
  },
}

// ─── count_open_violations ──────────────────────────────────────────

const countOpenViolations: Tool = {
  def: {
    name: 'count_open_violations',
    description:
      'Counts active CC&R violations by status (open, notice_sent, cured, fined, escalated). Use for "how many violations do we have", "are there fines".',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  async execute(_args, { db, orgId }) {
    // Paged to the end; a failed read throws (BL-047, as count_units_by_tenure).
    const data = await readAll<{ status: string | null }>(
      (from, to) =>
        db
          .from('hoa_violations')
          .select('id, status')
          .eq('org_id', orgId)
          .is('deleted_at', null)
          .order('id', { ascending: true })
          .range(from, to) as never,
      toolReadFailed(),
    )
    // Statuses are values, not keys: a key per status would put snake_case
    // DB enum values (notice_sent) into response field names (RC-11).
    const byStatus = new Map<string, number>()
    for (const r of data) {
      const s = r.status ?? 'unknown'
      byStatus.set(s, (byStatus.get(s) ?? 0) + 1)
    }
    return {
      total: data.length,
      byStatus: [...byStatus.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([status, count]) => ({ status, count })),
    }
  },
}

// ─── list_recent_meetings ───────────────────────────────────────────

const listRecentMeetings: Tool = {
  def: {
    name: 'list_recent_meetings',
    description:
      'Returns up to `limit` recent board / member meetings with date, type, and status.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 25, default: 5 },
      },
    },
  },
  async execute(args, { db, orgId }) {
    const limit = clampInt(args.limit, 1, 25, 5)
    const { data, error } = await db
      .from('hoa_meeting_minutes')
      .select('id, meeting_date, meeting_type, status')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('meeting_date', { ascending: false })
      .limit(limit)
    if (error) throw new ToolFailure('lookup_failed', error)
    return ((data ?? []) as Array<{
      meeting_date: string | null
      meeting_type: string | null
      status: string | null
    }>).map((m) => ({
      // meeting_date is a Postgres `date`: already YYYY-MM-DD.
      meetingDate: m.meeting_date,
      meetingType: m.meeting_type,
      status: m.status,
    }))
  },
}

// ─── count_properties ───────────────────────────────────────────────

const countProperties: Tool = {
  def: {
    name: 'count_properties',
    description:
      'Returns the total number of properties (lots/units) in the community.',
    parameters: { type: 'object', properties: {} },
  },
  async execute(_args, { db, orgId }) {
    const { count, error } = await db
      .from('hoa_properties')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('deleted_at', null)
    // An ignored error answered "0 properties" — a wrong fact, not a gap.
    if (error) throw new ToolFailure('lookup_failed', error)
    return { totalProperties: count ?? 0 }
  },
}

// ─── search_governing_docs ─────────────────────────────────────────────
//
// Wraps W1 (Governing Docs Brain) as a tool. Gives the agent a way to
// route rule/policy questions ("Can I paint my door red?", "What are
// the pet limits?") to RAG-over-PDFs while keeping the count/list
// questions on the typed DB tools above. Same citation shape W1 already
// produces — the agent aggregates these into the top-level response so
// the existing Copilot / AskDocsClient citation rendering keeps working.

// Match W1's output shape exactly — Confidence is uppercase, citations
// use chunkId / documentId / docType / section (no passage).
interface DocsCitation {
  chunkId: string
  documentId: string
  docType: string
  section: string | null
}

interface DocsToolResult {
  answer: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  citations: DocsCitation[]
  runId: string
}

export const searchGoverningDocs: Tool = {
  def: {
    name: 'search_governing_docs',
    description:
      "Searches the community's governing documents (CC&Rs, bylaws, rules, amendments) for rule / policy questions. Use this for questions about what is or isn't allowed, restrictions, processes, board duties, voting rights, fees, fines, ARC requirements, etc. Returns a cited answer with section references. Use this INSTEAD of fabricating policy answers from the DB tools.",
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            "The user's question, rephrased to focus on the rule/policy aspect (drop any DB-style filters). Example: from 'Can I paint my door red?' → 'paint color exterior approval'.",
        },
      },
      required: ['question'],
    },
  },
  async execute(args, { orgId, associationId }) {
    return runDocsSearch(args, { orgId, associationId: associationId ?? null })
  },
}

/**
 * The body of search_governing_docs, shared with the resident assistant
 * (which passes the resident-visible doc-type allowlist). Throws
 * ToolFailure; returns only the named fields.
 */
export async function runDocsSearch(
  args: Record<string, unknown>,
  ctx: { orgId: string; associationId: string | null; allowedDocTypes?: readonly string[] },
): Promise<DocsToolResult> {
  const question = String(args.question ?? '').trim().slice(0, 1000)
  if (!question) throw new ToolFailure('invalid_args')
  let result: DocsToolResult
  try {
    result = (await queryGoverningDocs(question, {
      organizationId: ctx.orgId,
      associationId: ctx.associationId,
      ...(ctx.allowedDocTypes ? { allowedDocTypes: ctx.allowedDocTypes } : {}),
    })) as DocsToolResult
  } catch (err) {
    // W1's message can name the vector table or carry the provider body.
    throw new ToolFailure('docs_unavailable', err)
  }
  // Name every field: whatever else W1 grows must not ride along.
  return {
    answer: result.answer,
    confidence: result.confidence,
    citations: (result.citations ?? []).map((c) => ({
      chunkId: c.chunkId,
      documentId: c.documentId,
      docType: c.docType,
      section: c.section,
    })),
    runId: result.runId,
  }
}

// ─── registry ────────────────────────────────────────────────────────

export const TOOLS: Tool[] = [
  countUnitsByTenure,
  listOverdueDues,
  getUnitOwner,
  countOpenViolations,
  listRecentMeetings,
  countProperties,
  searchGoverningDocs,
]

/** Citation/confidence shape exported so the agent can extract them
 *  from search_governing_docs tool calls and bubble up to the response. */
export type { DocsCitation, DocsToolResult }

export const TOOL_BY_NAME: Record<string, Tool> = Object.fromEntries(
  TOOLS.map((t) => [t.def.name, t]),
)

// ─── helpers ─────────────────────────────────────────────────────────

/** readAll's onError: a coded failure that keeps only the DB code. */
function toolReadFailed() {
  return (e: { code?: string }) => new ToolFailure('lookup_failed', e)
}

/** `numeric` dollars (string or number) → integer cents. The one conversion point here. */
function dollarsToCents(v: number | string | null | undefined): number {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}
