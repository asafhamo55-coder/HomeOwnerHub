/**
 * "Ask the guide" orchestration (BL-070, spec §6.3). The deterministic
 * steps live in ask-core.ts; this adds the model call, through an injected
 * `complete` so tests (and CI) never reach a provider.
 *
 * Order matters and is the point of the design:
 *   1. a rules question goes to Ask the Docs — no retrieval, no model;
 *   2. retrieval is filtered to the viewer's role;
 *   3. a weak top score refuses BEFORE the model is called;
 *   4. contact details are redacted before the question leaves the server;
 *   5. the reply is validated, and anything unproven is dropped;
 *   6. a model failure answers with the matching articles instead.
 *
 * The question is never logged or stored, here or in the route.
 */
import { redactContactPII } from '@homeowner-portal/ai/pii'
import {
  askDocsHref,
  buildAskMessages,
  isRulesQuestion,
  parseModelReply,
  passesGate,
  retrieve,
  suggestionsFrom,
  topScore,
  validateModelReply,
  type AskCitation,
  type AskSuggestion,
  type AskViewerRole,
  type ChatMessage,
} from './ask-core'

/** Sends messages to the model and returns its raw text. Throws on any failure. */
export type AskComplete = (messages: ChatMessage[]) => Promise<string>

export type AskResult =
  | { kind: 'answer'; answer: string; citations: AskCitation[]; takeMeThere: { label: string; href: string } | null }
  | { kind: 'not_covered'; suggestions: AskSuggestion[] }
  | { kind: 'rules_question'; askDocsHref: string }
  | { kind: 'unavailable'; suggestions: AskSuggestion[] }

/** Analytics facts about one ask: numbers and enums only (never the question). */
export interface AskMeta {
  topScore: number
  modelCalled: boolean
}

export async function askGuide(
  question: string,
  ctx: { role: AskViewerRole; route?: string | null },
  complete: AskComplete,
): Promise<AskResult & { meta: AskMeta }> {
  if (isRulesQuestion(question)) {
    return { kind: 'rules_question', askDocsHref: askDocsHref(ctx.role), meta: { topScore: 0, modelCalled: false } }
  }

  // Contact details are redacted once, up front: the model only ever sees
  // the redacted text, and retrieval ignores the placeholders (an email or phone
  // is not a topic, and its words would only dilute the gate's score).
  const redacted = redactContactPII(question)
  const sources = retrieve(redacted.replace(/\[(?:email|phone) removed\]/g, ' '), ctx.role, ctx.route)
  const score = topScore(sources)
  const suggestions = suggestionsFrom(sources, ctx.role)
  if (!passesGate(sources)) {
    return { kind: 'not_covered', suggestions, meta: { topScore: score, modelCalled: false } }
  }

  let raw: string
  try {
    raw = await complete(buildAskMessages(redacted, sources))
  } catch {
    return { kind: 'unavailable', suggestions, meta: { topScore: score, modelCalled: true } }
  }

  const reply = parseModelReply(raw)
  if (!reply) return { kind: 'unavailable', suggestions, meta: { topScore: score, modelCalled: true } }
  const valid = validateModelReply(reply, sources, ctx.role)
  if (!valid) return { kind: 'not_covered', suggestions, meta: { topScore: score, modelCalled: true } }
  return { kind: 'answer', ...valid, meta: { topScore: score, modelCalled: true } }
}
