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
  /** Optional — narrows governing-docs search to one association when
   *  the question is clearly about a specific community within a
   *  multi-association org. Null = search across all of org's docs. */
  associationId?: string | null
}

export interface Tool {
  def: ToolDefinition
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>
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
    const { data } = await db
      .from('hoa_properties')
      .select('tenure')
      .eq('org_id', orgId)
      .is('deleted_at', null)
    const counts = { owner_occupied: 0, leased: 0, unknown: 0, total: 0 }
    for (const r of (data ?? []) as Array<{ tenure: string | null }>) {
      counts.total += 1
      const t = (r.tenure ?? 'unknown') as keyof typeof counts
      if (t === 'owner_occupied' || t === 'leased' || t === 'unknown') counts[t] += 1
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
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await db
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
    type Row = {
      id: string
      amount: number | string
      due_date: string
      status: string
      unit: { address_line1: string | null; lot_number: string | null } | null
      payments: { amount: number | string }[]
    }
    return ((data ?? []) as unknown as Row[]).map((r) => {
      const paid = (r.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      const remaining = Math.max(Number(r.amount) - paid, 0)
      const daysOverdue = Math.max(
        0,
        Math.floor((Date.now() - new Date(r.due_date).getTime()) / 86_400_000),
      )
      return {
        address: r.unit?.address_line1 ?? '(unknown)',
        lot_number: r.unit?.lot_number ?? null,
        amount_due: Number(r.amount),
        amount_remaining: remaining,
        due_date: r.due_date,
        days_overdue: daysOverdue,
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
      "Looks up the current owner(s) of a property by address (partial match allowed). Returns owner name, email, phone. Use for 'who owns 829 Pistace Ct'.",
    parameters: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Full or partial street address.' },
      },
      required: ['address'],
    },
  },
  async execute(args, { db, orgId }) {
    const addr = String(args.address ?? '').trim().slice(0, 200)
    if (!addr) return { error: 'address required' }
    const { data: properties } = await db
      .from('hoa_properties')
      .select('id, address, owner_name, owner_email, owner_phone, tenure')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .ilike('address', `%${addr.replace(/[%_\\]/g, '\\$&')}%`)
      .limit(5)
    if (!properties || properties.length === 0) {
      return { matches: [] as const, note: `No property found matching "${addr}".` }
    }
    return {
      matches: (properties as Array<{
        id: string
        address: string
        owner_name: string | null
        owner_email: string | null
        owner_phone: string | null
        tenure: string | null
      }>).map((p) => ({
        address: p.address,
        owner_name: p.owner_name,
        owner_email: p.owner_email,
        owner_phone: p.owner_phone,
        tenure: p.tenure,
      })),
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
    const { data } = await db
      .from('hoa_violations')
      .select('status')
      .eq('org_id', orgId)
      .is('deleted_at', null)
    const counts: Record<string, number> = { total: 0 }
    for (const r of (data ?? []) as Array<{ status: string | null }>) {
      counts.total += 1
      const s = r.status ?? 'unknown'
      counts[s] = (counts[s] ?? 0) + 1
    }
    return counts
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
    const { data } = await db
      .from('hoa_meeting_minutes')
      .select('id, meeting_date, meeting_type, status')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('meeting_date', { ascending: false })
      .limit(limit)
    return (data ?? []) as Array<{
      id: string
      meeting_date: string | null
      meeting_type: string | null
      status: string | null
    }>
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
    const { count } = await db
      .from('hoa_properties')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('deleted_at', null)
    return { total_properties: count ?? 0 }
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

const searchGoverningDocs: Tool = {
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
    const question = String(args.question ?? '').trim().slice(0, 1000)
    if (!question) return { error: 'question required' }
    try {
      const result = (await queryGoverningDocs(question, {
        organizationId: orgId,
        associationId: associationId ?? null,
      })) as DocsToolResult
      return result
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : 'doc search failed',
      }
    }
  },
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

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}
