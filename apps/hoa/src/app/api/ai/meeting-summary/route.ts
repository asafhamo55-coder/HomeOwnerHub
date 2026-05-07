import { NextResponse } from 'next/server'
import { z } from 'zod'
import { summarizeMeeting } from '@homeownerhub/ai'
import { getCurrentOrg } from '@/lib/orgs'

const Schema = z.object({
  meetingDate: z.string().min(4),
  transcript: z.string().min(50),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = Schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', message: parsed.error.issues[0]?.message ?? 'Invalid input.' },
      { status: 400 },
    )
  }

  const org = await getCurrentOrg()
  if (!org) return NextResponse.json({ error: 'no_org' }, { status: 403 })

  let summary: string
  try {
    summary = await summarizeMeeting({
      hoaName: org.name,
      meetingDate: parsed.data.meetingDate,
      transcript: parsed.data.transcript,
    })
  } catch (err) {
    console.error('[meeting-summary] AI failed', err)
    return NextResponse.json(
      {
        error: 'ai_unavailable',
        message:
          'AI is offline. You can still write the minutes manually below — the BarBGate gate works either way.',
      },
      { status: 503 },
    )
  }

  return NextResponse.json({ summary })
}
