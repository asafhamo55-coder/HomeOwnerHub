/**
 * Product analytics (BL-009): the allowlist of named events.
 *
 * The allowlist IS the privacy guarantee, as in lib/guide/help-events.ts.
 * Every event has a fixed, strict set of props, and every prop is an enum, a
 * boolean or a small integer. There is no string field that could carry free
 * text, so a name, an email, an address, a subject line or a record id cannot
 * be expressed, let alone sent. An unknown event name, an unknown prop or a
 * value outside its enum makes `sanitizeEvent` return null and nothing is sent.
 */
import { z } from 'zod'

const APPROVAL_KINDS = ['w18', 'bill', 'opening', 'w3', 'collections', 'contact', 'join', 'pro', 'vendor'] as const
const DRAFT_KINDS = ['reply', 'forward', 'new'] as const

export const ANALYTICS_EVENTS = {
  /** A resident opened the Pay dues screen with something to pay. */
  'resident.pay_opened': z.object({ zelleConfigured: z.boolean() }).strict(),
  /** A board member approved or rejected a row in the approvals inbox. */
  'approval.decided': z
    .object({ kind: z.enum(APPROVAL_KINDS), decision: z.enum(['approve', 'reject']) })
    .strict(),
  /** An AI reply draft was produced in the inbox (button, or draft-on-open). */
  'inbox.draft_created': z.object({ trigger: z.enum(['button', 'auto']) }).strict(),
  /** A draft was approved to send; `edited` = the board changed the AI text first. */
  'inbox.draft_approved': z
    .object({ kind: z.enum(DRAFT_KINDS), edited: z.boolean(), closeThread: z.boolean() })
    .strict(),
  /** A communication was sent or scheduled. */
  'communication.sent': z
    .object({ scheduled: z.boolean(), channelCount: z.number().int().min(1).max(4), sms: z.boolean() })
    .strict(),
  /** A violation was filed through the board wizard. */
  'violation.created': z
    .object({ severity: z.enum(['low', 'medium', 'high', 'none']), fromThread: z.boolean() })
    .strict(),
  /** The board decided (or moved to review) an ARC application. */
  'arc.decided': z.object({ decision: z.enum(['in_review', 'approved', 'denied']) }).strict(),
  /** A resident submitted something to the board. */
  'resident.request_submitted': z
    .object({ type: z.enum(['ticket', 'arc', 'violation_report']) })
    .strict(),
} as const

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS
export type AnalyticsEventProps<N extends AnalyticsEventName> = z.infer<(typeof ANALYTICS_EVENTS)[N]>

export const ANALYTICS_EVENT_NAMES = Object.keys(ANALYTICS_EVENTS) as AnalyticsEventName[]

export interface SanitizedEvent {
  name: AnalyticsEventName
  props: Record<string, string | number | boolean>
}

function isEventName(name: string): name is AnalyticsEventName {
  return Object.prototype.hasOwnProperty.call(ANALYTICS_EVENTS, name)
}

/**
 * The event as it may be sent, or null. Untyped on purpose: callers go
 * through `trackEvent`, which is typed; this is the runtime backstop for a
 * cast, a stale bundle or a value that only fails at runtime.
 */
export function sanitizeEvent(name: string, props: unknown): SanitizedEvent | null {
  if (!isEventName(name)) return null
  const parsed = ANALYTICS_EVENTS[name].safeParse(props ?? {})
  if (!parsed.success) return null
  return { name, props: parsed.data as Record<string, string | number | boolean> }
}
