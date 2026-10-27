import { NextResponse } from 'next/server'
import { z } from 'zod'
import { withRoute } from '@/lib/api/handler'
import { requireRouteAnyRole } from '@/lib/api/auth'
import { requireAiQuota } from '@/lib/api/rate-limit'
import { parseJson } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { askGuide } from '@/lib/guide/ask'
import { completeAskWithModel } from '@/lib/guide/ask-model'
import { GUIDE_ROUTE_INDEX } from '@/generated/guide'
import { matchRouteTemplate } from '@/lib/guide/routes'
import { latencyBucket, logHelpEvent, safeRouteTemplate, scoreBucket } from '@/lib/guide/help-events'

// "Ask the guide" (BL-070, spec §6.3).
// POST { question: string ≤500, route?: string }
// → 200 one of
//     { kind: 'answer', answer, citations: [{ articleId, title, sectionHeading, href }], takeMeThere: { label, href } | null }
//     { kind: 'not_covered', suggestions: [{ articleId, title, summary, href }] }
//     { kind: 'rules_question', askDocsHref }
//     { kind: 'unavailable', suggestions }        (model down: the matching articles instead)
// → error envelope (RC-1) otherwise.
//
// A refusal and a model outage are answers about the guide, not failures of
// this route, so they are 200s the UI renders as states. The question is
// never logged or stored: the one log line (help.ask) carries the route
// template, role, outcome and buckets only.

const Body = z.object({
  question: zText(500, 3),
  // The pathname the drawer was opened on. Only used to boost that page's
  // articles; logged only as its matched template, never as given.
  route: zText(200).optional(),
})

export const POST = withRoute('help.ask', async (request) => {
  // Resident-callable: residents ask from the portal's help drawer. The
  // corpus holds no tenant data, and retrieval is filtered to the
  // caller's role (resident articles for residents, board ones otherwise).
  const { orgId, role: realRole } = await requireRouteAnyRole()
  // A professional reads the board articles (no tenant data in the corpus).
  const role = realRole === 'resident' ? 'resident' : realRole === 'admin' ? 'admin' : 'board'
  const body = await parseJson(request, Body, { maxBytes: 8 * 1024 })
  // BL-078: per-user + per-org limit (lib/api/ai-limits.ts).
  await requireAiQuota('help_ask', orgId)

  const started = Date.now()
  const route = body.route?.startsWith('/') ? body.route : null
  const result = await askGuide(body.question, { role, route }, completeAskWithModel)
  const { meta, ...response } = result

  logHelpEvent(
    {
      event: 'help.ask',
      routeTemplate: safeRouteTemplate(route ? matchRouteTemplate(route, Object.keys(GUIDE_ROUTE_INDEX)) : null),
      kind: response.kind,
      citationCount: response.kind === 'answer' ? response.citations.length : 0,
      topScoreBucket: scoreBucket(meta.topScore),
      latencyBucket: latencyBucket(Date.now() - started),
    },
    role,
  )

  return NextResponse.json(response)
})
