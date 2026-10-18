import { NextResponse } from 'next/server'
import { withRoute } from '@/lib/api/handler'
import { requireRouteMember } from '@/lib/api/auth'
import { parseJson } from '@/lib/api/parse'
import { HelpClientEvent, logHelpEvent } from '@/lib/guide/help-events'

// Help analytics beacon (BL-070, spec §8): POST one allowlisted event →
// one structured server log line → 204. No table (phases 1–2).
//
// The body schema is the allowlist: every field is an enum, bucket, small
// count, known article id or known route template, and unknown keys are
// stripped, so no free text can reach the log. The role comes from the
// gate, never the client.

export const POST = withRoute('help.event', async (request) => {
  // Resident-callable: the resident help drawer and pages send these too.
  const { role } = await requireRouteMember()
  const event = await parseJson(request, HelpClientEvent, { maxBytes: 2 * 1024 })
  logHelpEvent(event, role)
  return new NextResponse(null, { status: 204 })
})
