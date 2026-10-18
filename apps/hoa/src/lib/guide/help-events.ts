/**
 * Help analytics (BL-070, spec §8), phases 1–2: no table, no migration —
 * one structured JSON log line per event, queryable in Vercel logs.
 *
 * The allowlist IS the privacy guarantee. Each event has a fixed set of
 * fields, every field is an enum, a bucket, a small integer, a known
 * article id or a known route TEMPLATE. There is no free-text field, so
 * question or search text, a concrete path with an id, a name, an email or
 * an org name cannot be expressed, let alone logged. Unknown keys are
 * dropped (zod strips them), and a value outside its enum fails the parse.
 *
 * The viewer's role is never taken from the client: the route adds it from
 * the auth gate.
 */
import { z } from 'zod'
import { GUIDE_ARTICLES, GUIDE_ROUTE_INDEX } from '@/generated/guide'
import { LATENCY_BUCKETS, LENGTH_BUCKETS, SCORE_BUCKETS } from './help-buckets'

export { latencyBucket, lengthBucket, scoreBucket } from './help-buckets'

const ARTICLE_IDS = new Set(GUIDE_ARTICLES.map((a) => a.id))
const ROUTE_TEMPLATES = new Set(Object.keys(GUIDE_ROUTE_INDEX))

/** A real guide article id, or the event is refused. */
const zArticleId = z.string().max(80).refine((v) => ARTICLE_IDS.has(v), 'unknown article')
/** A route TEMPLATE the guide knows (`/violations/[id]`), or null. Never a concrete path. */
const zRouteTemplate = z
  .string()
  .max(120)
  .refine((v) => ROUTE_TEMPLATES.has(v), 'unknown route template')
  .nullable()
const zCount = z.number().int().min(0).max(50)
export const ASK_KINDS = ['answer', 'not_covered', 'rules_question', 'unavailable', 'error'] as const
const zAskKind = z.enum(ASK_KINDS)
const zSource = z.enum(['center', 'drawer', 'ask', 'checklist', 'empty_state', 'palette', 'whats_new'])
const zLengthBucket = z.enum(LENGTH_BUCKETS)
const zScoreBucket = z.enum(SCORE_BUCKETS)
const zLatencyBucket = z.enum(LATENCY_BUCKETS)

/** Client-sendable events and their fields. `help.ask` is server-only (the ask route logs it). */
export const HelpClientEvent = z.discriminatedUnion('event', [
  z.object({ event: z.literal('help.drawer_open'), routeTemplate: zRouteTemplate, matchedCount: zCount }),
  z.object({ event: z.literal('help.search'), resultCount: zCount, queryLengthBucket: zLengthBucket }),
  z.object({ event: z.literal('help.article_view'), articleId: zArticleId, source: zSource }),
  z.object({ event: z.literal('help.take_me_there'), articleId: zArticleId, source: zSource }),
  z.object({ event: z.literal('help.feedback'), articleId: zArticleId.optional(), askKind: zAskKind.optional(), helpful: z.boolean() }),
  z.object({ event: z.literal('help.show_me'), articleId: zArticleId, found: z.boolean() }),
])
export type HelpClientEvent = z.infer<typeof HelpClientEvent>

export interface HelpAskEvent {
  event: 'help.ask'
  routeTemplate: string | null
  kind: (typeof ASK_KINDS)[number]
  citationCount: number
  topScoreBucket: z.infer<typeof zScoreBucket>
  latencyBucket: z.infer<typeof zLatencyBucket>
}

export type HelpRole = 'admin' | 'board' | 'resident'

/** A known route template, else null. Safe to log: templates hold no ids. */
export function safeRouteTemplate(template: string | null | undefined): string | null {
  return template && ROUTE_TEMPLATES.has(template) ? template : null
}

/** The one log line. Keys are fixed; `role` comes from the server gate. */
export function helpLogLine(e: HelpClientEvent | HelpAskEvent, role: HelpRole): string {
  return JSON.stringify({ type: 'help_event', ...e, role })
}

export function logHelpEvent(e: HelpClientEvent | HelpAskEvent, role: HelpRole): void {
  console.info(helpLogLine(e, role))
}
