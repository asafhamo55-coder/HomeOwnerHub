import { NextResponse } from 'next/server'
import { z } from 'zod'
import { suggestFieldValues } from '@homeownerhub/ai'
import { getCurrentOrg } from '@/lib/orgs'

const Schema = z.object({
  kind: z.enum(['violation', 'meeting', 'eviction_case']),
  partialState: z.record(z.string(), z.unknown()),
  fields: z.array(z.string()).optional(),
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

  try {
    const suggestions = await suggestFieldValues({
      kind: parsed.data.kind,
      partialState: parsed.data.partialState,
      fields: parsed.data.fields,
    })
    return NextResponse.json({ suggestions })
  } catch (err) {
    console.error('[suggest-fields] failed', err)
    return NextResponse.json(
      {
        error: 'ai_unavailable',
        message:
          'AI suggestions are offline. You can still fill in the fields by hand using sensible defaults.',
      },
      { status: 503 },
    )
  }
}
