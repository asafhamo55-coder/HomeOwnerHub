import { NextResponse, type NextRequest } from 'next/server'
import { ingestAllActive, ingestTicker } from '@/lib/ingest'

// POST /api/ingest
//   body { symbol: "NVDA" } → ingest one ticker
//   body {}                  → refresh every active ticker (cron target)
//
// Same idempotent code path as the UI's server actions. The Inngest weekly
// cron hits this endpoint with an empty body. Optional shared-secret gate via
// CRON_SECRET (Authorization: Bearer <secret>) when set — left open otherwise
// since this is a free app with no destructive surface.
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let body: { symbol?: string } = {}
  try {
    body = await req.json()
  } catch {
    /* empty body → refresh all */
  }

  try {
    if (body.symbol) {
      const result = await ingestTicker(body.symbol)
      return NextResponse.json({ ok: true, result })
    }
    const results = await ingestAllActive()
    return NextResponse.json({ ok: true, refreshed: results.length, results })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 })
  }
}
