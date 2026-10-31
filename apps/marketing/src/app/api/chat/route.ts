// POST /api/chat: the website Help chat. Grounded in our own pages, guides and
// help articles only (lib/chat). Deploying without AI_API_KEY is safe: the
// route answers 503 and the widget shows a friendly "not available yet" note.
// No transcripts are stored and nothing the visitor typed is logged.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { retrieve } from '../../../lib/chat/corpus'
import {
  MAX_BODY_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_USER_TURNS,
  allowIp,
  allowToday,
  dailyCap,
} from '../../../lib/chat/limits'
import { chatKey, completeChat } from '../../../lib/chat/model'
import { buildMessages, parseAnswer } from '../../../lib/chat/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(MAX_MESSAGE_CHARS * 4),
      }),
    )
    .min(1)
    .max(MAX_USER_TURNS * 2),
})

function fail(status: number, code: string, message: string, headers?: Record<string, string>) {
  return NextResponse.json({ error: { code, message } }, { status, headers })
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return fwd || req.headers.get('x-real-ip') || 'unknown'
}

/** Lets the widget show the "not available yet" note up front. No model call. */
export async function GET() {
  return NextResponse.json({ available: Boolean(chatKey()) }, { headers: { 'cache-control': 'no-store' } })
}

export async function POST(req: Request) {
  if (!chatKey()) {
    return fail(503, 'chat_unavailable', 'The chat is not available yet. Please use Talk to a person.')
  }

  const raw = await req.text()
  if (raw.length > MAX_BODY_CHARS) return fail(413, 'too_long', 'That message is too long.')
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return fail(400, 'bad_request', 'That request could not be read.')
  }
  const parsed = Body.safeParse(json)
  if (!parsed.success) return fail(400, 'bad_request', 'That request could not be read.')
  const history = parsed.data.messages
  const last = history[history.length - 1]!
  if (last.role !== 'user') return fail(400, 'bad_request', 'That request could not be read.')
  if (history.some((t) => t.role === 'user' && t.content.length > MAX_MESSAGE_CHARS)) {
    return fail(413, 'too_long', `Please keep your question under ${MAX_MESSAGE_CHARS} characters.`)
  }
  if (history.filter((t) => t.role === 'user').length > MAX_USER_TURNS) {
    return fail(429, 'too_many_turns', 'This chat is getting long. Please start a new one or talk to a person.')
  }

  if (!allowIp(clientIp(req))) {
    return fail(429, 'rate_limited', 'You are asking quickly. Please wait a few minutes.', { 'retry-after': '600' })
  }
  if (!allowToday(dailyCap())) {
    return fail(503, 'daily_cap', 'The chat has reached its limit for today. Please use Talk to a person.')
  }

  // Search with the new question plus the one before it, so "and for 200 homes?" still finds pricing.
  const previousUser = [...history].slice(0, -1).reverse().find((t) => t.role === 'user')
  const hits = retrieve(`${previousUser?.content ?? ''} ${last.content}`.trim(), 5)
  if (hits.length === 0) return NextResponse.json({ answer: '', sources: [], offerPerson: true })

  let reply: string
  try {
    reply = await completeChat(buildMessages(history, hits))
  } catch (err) {
    // Fixed codes only: never the provider body, never the question.
    console.error('[chat] model call failed:', err instanceof Error ? err.message : 'unknown')
    return fail(503, 'chat_unavailable', 'The chat could not answer just now. Please use Talk to a person.')
  }

  const out = parseAnswer(reply)
  if (out.notFound) return NextResponse.json({ answer: '', sources: [], offerPerson: true })
  const picked = out.used.map((n) => hits[n - 1]).filter((h): h is NonNullable<typeof h> => Boolean(h))
  const cited = (picked.length ? picked : hits.slice(0, 1)).slice(0, 3)
  return NextResponse.json({
    answer: out.answer,
    sources: cited.map((h) => ({ title: h.passage.title, url: h.passage.url })),
    offerPerson: false,
  })
}
