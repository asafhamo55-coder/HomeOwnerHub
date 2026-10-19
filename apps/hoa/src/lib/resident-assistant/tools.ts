// BL-096 — the resident assistant's toolset. Resident tools ONLY.
//
// The board Copilot's DB tools (lib/community-qa/tools.ts: owner lookups,
// org-wide counts, delinquency lists) are never registered here; the loop
// only knows the tools it is handed, so a model that names one gets
// `unknown_tool`. tools.test.ts asserts the two registries are disjoint
// apart from the shared docs search.
//
// Every data tool runs through ./reads.ts on the resident's own RLS-bound
// client, scoped to their units and user id. No tool writes: the two
// hand-off tools only RECORD a suggestion, which the chat shows as a button
// that opens a prefilled form the resident must review and submit.

import { RESIDENT_VISIBLE_TYPES } from '@/lib/resident-documents/visibility'
import { searchSections } from '@/lib/guide'
import { articleHelpHref } from '@/lib/guide/ask-core'
import { paySettingsSecret, readZelleSettings } from '@/lib/pay-by-zelle'
import { redactContactPII } from '@homeowner-portal/ai/pii'
import { ToolFailure, runDocsSearch, type ToolDefinition } from '@/lib/community-qa/tools'
import type { LoopTool } from '@/lib/community-qa/loop'
import {
  ScopeReadFailed,
  readCommunityUpdates,
  readMyAccount,
  readMyPaymentPlan,
  readMyRequests,
  type ResidentScope,
} from './reads'
import { clampHandoffText, type HandoffAction } from './handoff'

export interface ResidentToolContext {
  scope: ResidentScope
  /** The association docs search narrows to, when the resident has exactly one. */
  associationId: string | null
}

export type ResidentTool = LoopTool<ResidentToolContext>

/** A scope read failure becomes the fixed tool vocabulary, keeping the db code for the log. */
async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof ScopeReadFailed) throw new ToolFailure('lookup_failed', { code: err.dbCode })
    throw err
  }
}

const noArgs: ToolDefinition['parameters'] = { type: 'object', properties: {} }

// ─── search_governing_docs ───────────────────────────────────────────

const searchGoverningDocs: ResidentTool = {
  def: {
    name: 'search_governing_docs',
    description:
      "Searches this community's governing documents (CC&Rs, bylaws, rules, amendments, policies) for a rules question: what is or isn't allowed, approvals needed, pet / parking / rental / paint limits, fines, processes. Returns a cited answer. Always use this for a rules question — never answer a rule from memory.",
    parameters: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description:
            "The rules topic only, with no names, addresses or contact details. Example: from 'Can I paint my front door red?' → 'front door paint color approval'.",
        },
      },
      required: ['question'],
    },
  },
  async execute(args, { scope, associationId }) {
    // W1 records its query in ai_runs: strip any contact detail the model
    // copied in, so that row holds a rules topic, not a person.
    const question = redactContactPII(String(args.question ?? ''))
    const out = await runDocsSearch(
      { question },
      { orgId: scope.orgId, associationId, allowedDocTypes: RESIDENT_VISIBLE_TYPES.governing },
    )
    // Belt and braces (as /api/ai/ask-docs): never cite a hidden doc type.
    const allowed = RESIDENT_VISIBLE_TYPES.governing
    if (out.citations.some((c) => !allowed.includes(c.docType))) throw new ToolFailure('docs_unavailable')
    return out
  },
}

// ─── my_account ──────────────────────────────────────────────────────

const myAccount: ResidentTool = {
  def: {
    name: 'my_account',
    description:
      "The signed-in resident's OWN account: balance owed, open and past-due charges, next due date, last payment, any payment plan the portal can show, and how to pay. Use for 'What do I owe?', 'When is my next payment due?', 'Am I behind?', 'How do I pay?'.",
    parameters: noArgs,
  },
  async execute(_args, { scope }) {
    return guarded(async () => {
      const [account, plan, zelle] = await Promise.all([readMyAccount(scope), readMyPaymentPlan(scope), zelleReady(scope)])
      return {
        ...account,
        paymentPlan: plan.visible ? plan.plan : null,
        paymentPlanVisible: plan.visible,
        howToPay: {
          payPage: '/resident/dues/pay',
          statementPage: '/resident/dues/statement',
          zelleSetUp: zelle,
          onlineCardPayments: false,
        },
      }
    })
  },
}

/** Whether the board has set up Pay by Zelle for the resident's association. Never the recipient itself. */
async function zelleReady(scope: ResidentScope): Promise<boolean> {
  const ids = [...new Set(scope.units.map((u) => u.association_id).filter((id): id is string => !!id))]
  if (ids.length === 0) return false
  const { data, error } = await scope.db
    .from('associations')
    .select('id, compliance_settings')
    .in('id', ids)
    .eq('organization_id', scope.orgId)
  if (error) return false
  const secret = paySettingsSecret()
  return ((data ?? []) as Array<{ id: string; compliance_settings: unknown }>).some(
    (r) => readZelleSettings(r.id, r.compliance_settings, secret).state === 'configured',
  )
}

// ─── my_requests ─────────────────────────────────────────────────────

const myRequests: ResidentTool = {
  def: {
    name: 'my_requests',
    description:
      "Status of the signed-in resident's OWN support requests (tickets), ARC applications, open violations on their home, and concerns they reported. Use for 'Where's my ARC request?', 'Did the board answer my ticket?', 'Do I have a violation?'.",
    parameters: noArgs,
  },
  async execute(_args, { scope }) {
    return guarded(() => readMyRequests(scope))
  },
}

// ─── community_updates ───────────────────────────────────────────────

const communityUpdates: ResidentTool = {
  def: {
    name: 'community_updates',
    description:
      "Recent announcements sent to this resident, and upcoming meetings when the portal can show them. Use for 'When is the next meeting?', 'Any news from the board?'. If meetings.available is false, the meetings list isn't available in the portal yet.",
    parameters: noArgs,
  },
  async execute(_args, { scope }) {
    return guarded(() => readCommunityUpdates(scope))
  },
}

// ─── portal_how_to ───────────────────────────────────────────────────

const portalHowTo: ResidentTool = {
  def: {
    name: 'portal_how_to',
    description:
      "Searches the resident user guide for how to do something in this portal: pay dues, get a statement, submit an ARC application, open a support request, update contact details, find documents or meetings. Not for community rules.",
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'What the resident wants to do in the portal.' },
      },
      required: ['question'],
    },
  },
  async execute(args) {
    const q = String(args.question ?? '').trim().slice(0, 300)
    if (!q) throw new ToolFailure('invalid_args')
    // Resident audience only: board and admin articles never match.
    const hits = searchSections(q, 'resident', 3)
    return {
      articles: hits.map((h) => ({
        title: h.article.title,
        summary: h.article.summary,
        section: h.heading,
        snippet: h.snippet,
        href: articleHelpHref(h.article.id, 'resident', h.sectionId),
      })),
    }
  },
}

// ─── hand-offs (no writes) ───────────────────────────────────────────

function handoffTool(name: string, action: HandoffAction, description: string): ResidentTool {
  return {
    def: {
      name,
      description,
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'A short subject line, 5-120 characters, in the resident’s words.' },
          description: {
            type: 'string',
            description: 'What the resident wants, 1-4 sentences, drawn from this chat. No other people’s names or details.',
          },
        },
        required: ['subject', 'description'],
      },
    },
    async execute(args) {
      const subject = clampHandoffText(args.subject, 120)
      const body = clampHandoffText(args.description, 1500)
      if (!subject) throw new ToolFailure('invalid_args')
      // Nothing is created: this is shown as a button the resident may tap.
      return { action, subject, description: body, shownAsButton: true, created: false }
    },
  }
}

const suggestAskBoard = handoffTool(
  'suggest_ask_board',
  'ask_board',
  'Offer the resident an "Ask the board" button that opens a new support request with this subject and description prefilled. Use when the docs do not answer a rules question, when only the board can decide, or for a billing, maintenance or account problem. It creates nothing; the resident reviews and sends it.',
)

const suggestArcApplication = handoffTool(
  'suggest_arc_application',
  'start_arc',
  'Offer the resident a "Start an ARC application" button that opens the architectural application form prefilled. Use when they want to change the outside of their home (paint, fence, deck, roof, landscaping, solar, addition). It creates nothing; the resident reviews and submits it.',
)

// ─── registry ────────────────────────────────────────────────────────

export const RESIDENT_TOOLS: readonly ResidentTool[] = [
  searchGoverningDocs,
  myAccount,
  myRequests,
  communityUpdates,
  portalHowTo,
  suggestAskBoard,
  suggestArcApplication,
]

export const HANDOFF_TOOL_NAMES: ReadonlySet<string> = new Set([suggestAskBoard.def.name, suggestArcApplication.def.name])
