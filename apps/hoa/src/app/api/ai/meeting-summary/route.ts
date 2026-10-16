import { NextResponse } from 'next/server'
import { z } from 'zod'
import { summarizeMeeting } from '@homeowner-portal/ai'
import { withRoute } from '@/lib/api/handler'
import { ApiRouteError } from '@/lib/api/errors'
import { requireRouteBoardOrAdmin } from '@/lib/api/auth'
import { parseJson, parseValue } from '@/lib/api/parse'
import { zDateOnly, zText } from '@/lib/api/schemas'
import { MAX_DOCUMENT_TEXT, MAX_JSON_BYTES } from '@/lib/api/limits'
import { logRouteFailure } from '@/lib/api/log'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// Board-only AI drafting (RC-4): the only caller is
// (dashboard)/meetings/MeetingWizard.tsx.

const Body = z.object({
  // Goes into the prompt only, but it is still a real date (C-11).
  meetingDate: zDateOnly,
  transcript: zText(MAX_DOCUMENT_TEXT, 50),
})

const AI_OFFLINE =
  'AI is offline. You can still write the minutes manually below — the BarBGate gate works either way.'

const TRANSCRIPT_TOO_LONG = `The transcript is too long. Keep it under ${MAX_DOCUMENT_TEXT.toLocaleString('en-US')} characters.`

/**
 * RC-1: going over a string limit is 413, not 400. zText's .max() would
 * report it as validation_failed, so the transcript length is checked on
 * the raw (already size-capped) JSON before the schema runs. Measured
 * after trim, exactly as zText measures it.
 */
function transcriptTooLong(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false
  const t = (raw as { transcript?: unknown }).transcript
  return typeof t === 'string' && t.trim().length > MAX_DOCUMENT_TEXT
}

export const POST = withRoute('ai.meeting-summary', async (request) => {
  const { orgId } = await requireRouteBoardOrAdmin()
  const raw = await parseJson(request, z.unknown()) // 400 invalid_json / 413 over the 1 MB body cap
  if (transcriptTooLong(raw)) {
    throw new ApiRouteError('payload_too_large', TRANSCRIPT_TOO_LONG, {
      reason: 'transcript_too_long',
      maxBytes: MAX_JSON_BYTES,
      maxLength: MAX_DOCUMENT_TEXT,
    })
  }
  const body = parseValue(Body, raw)

  // The prompt needs the org's name. Read it by the gate's org id (RC-4) so
  // it is the same org the role check ran against — not a second
  // cookie-based resolution that could disagree with it.
  const supabase = await getSupabaseServerClient()
  const { data: org, error } = await supabase.from('orgs').select('name').eq('id', orgId).maybeSingle()
  if (error || !org) {
    // The gate just confirmed membership, so a missing row is unexpected too.
    logRouteFailure('ai.meeting-summary.org', error, { orgId, found: !!org })
    throw new ApiRouteError('internal')
  }

  let summary: string
  try {
    summary = await summarizeMeeting({
      hoaName: org.name,
      meetingDate: body.meetingDate,
      transcript: body.transcript,
    })
  } catch (err) {
    logRouteFailure('ai.meeting-summary', err, { orgId, transcriptLength: body.transcript.length })
    throw new ApiRouteError('upstream_unavailable', AI_OFFLINE)
  }

  return NextResponse.json({ summary })
})
