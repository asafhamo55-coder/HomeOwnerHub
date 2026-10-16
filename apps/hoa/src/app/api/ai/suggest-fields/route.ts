import { NextResponse } from 'next/server'
import { z } from 'zod'
import { suggestFieldValues } from '@homeowner-portal/ai'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { zText } from '@/lib/api/schemas'
import { MAX_LONG_TEXT } from '@/lib/api/limits'
import { logRouteFailure } from '@/lib/api/log'

// Board-only (RC-4): both callers are (dashboard) wizards —
// violations/new/Wizard.tsx and meetings/MeetingWizard.tsx.

const MAX_STATE_KEYS = 50
const MAX_FIELDS = 20

// partialState is free-form wizard context fed to the model. Bounded
// (RC-8): flat scalar values only, each string ≤ MAX_LONG_TEXT, ≤ 50 keys.
const StateValue = z.union([zText(MAX_LONG_TEXT), z.number().finite(), z.boolean(), z.null()])

const Schema = z.object({
  kind: z.enum(['violation', 'meeting', 'eviction_case']),
  partialState: z
    .record(zText(100, 1), StateValue)
    .refine((o) => Object.keys(o).length <= MAX_STATE_KEYS, `At most ${MAX_STATE_KEYS} fields of context.`),
  fields: z.array(zText(100, 1)).max(MAX_FIELDS).optional(),
})

export const POST = withRoute('ai.suggest-fields', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const body = await parseJson(request, Schema)

  let suggestions
  try {
    suggestions = await suggestFieldValues({
      kind: body.kind,
      partialState: body.partialState,
      fields: body.fields,
    })
  } catch (err) {
    logRouteFailure('ai.suggest-fields', err, { orgId, kind: body.kind })
    throw new ApiRouteError(
      'upstream_unavailable',
      'AI suggestions are offline. You can still fill in the fields by hand using sensible defaults.',
    )
  }

  return NextResponse.json({ suggestions })
})
