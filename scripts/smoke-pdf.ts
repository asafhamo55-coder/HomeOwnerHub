/**
 * scripts/smoke-pdf.ts
 *
 * HTTP smoke for the board-packet PDF route. Spawns nothing — relies
 * on a dev server already running on port 3000 (or HOA_PORT). Uses
 * dev-login cookies for auth, hits /api/accounting/board-packet/[periodId]
 * for the most-recent fiscal period, and asserts:
 *
 *   - HTTP 200
 *   - content-type: application/pdf
 *   - body starts with %PDF- magic bytes
 *   - body is at least 1 KB (not an empty document)
 *
 * Optionally writes the PDF to /tmp/board-packet-smoke.pdf so you can
 * eyeball it. Set SMOKE_PDF_WRITE=0 to skip the file write.
 */

import './_load-env'
import { writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../packages/db/src/database.types'

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const PORT = process.env.HOA_PORT ?? '3000'
const BASE = `http://localhost:${PORT}`

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('[smoke-pdf] missing SUPABASE_URL / SERVICE_ROLE_KEY')
  process.exit(1)
}

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main(): Promise<void> {
  const db = createClient<Database>(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Mirror getPrimaryAssociation()'s logic so we test the period the
  // dev-login user actually sees. orgs.ts: first HOA org by joined_at.
  // vendors.ts: first association by name within that org.
  const email = process.env.DEV_AUTOLOGIN_EMAIL
  if (!email) {
    console.error('[smoke-pdf] DEV_AUTOLOGIN_EMAIL not set')
    process.exit(1)
  }
  const { data: usersResp } = await db.auth.admin.listUsers()
  const user = usersResp.users.find((u) => u.email === email)
  if (!user) {
    console.error(`[smoke-pdf] user ${email} not found`)
    process.exit(1)
  }

  const { data: members } = await db
    .from('org_members')
    .select('org:orgs(id, name, hub_type), joined_at')
    .eq('user_id', user.id)
    .order('joined_at', { ascending: true })
  const hoaOrgId = (members ?? [])
    .map((m) => (m.org as { id: string; hub_type: string } | null))
    .find((o) => o?.hub_type === 'hoa')?.id
  if (!hoaOrgId) {
    console.error(`[smoke-pdf] ${email} has no HOA org membership`)
    process.exit(1)
  }

  const { data: assocs } = await db
    .from('associations')
    .select('id, name')
    .eq('organization_id', hoaOrgId)
    .order('name', { ascending: true })
    .limit(1)
  const assoc = assocs?.[0]
  if (!assoc) {
    console.error('[smoke-pdf] no association for the dev user')
    process.exit(1)
  }

  const { data: period } = await db
    .from('fiscal_periods')
    .select('id, start_date, end_date, status')
    .eq('association_id', assoc.id)
    .order('start_date', { ascending: false })
    .limit(1)
    .single()
  if (!period) {
    console.error('[smoke-pdf] no fiscal_period for primary assoc — run pnpm seed:accounting')
    process.exit(1)
  }
  console.log(`[smoke-pdf] dev user primary assoc: ${assoc.name}`)

  console.log(
    `[smoke-pdf] using period=${period.id} (${period.start_date} → ${period.end_date}, ${period.status})\n`,
  )

  // Confirm the dev server is up before trying dev-login.
  try {
    const probe = await fetch(`${BASE}/`, { redirect: 'manual' })
    if (probe.status >= 500) {
      console.error(`[smoke-pdf] dev server at ${BASE} returned ${probe.status}`)
      process.exit(1)
    }
  } catch {
    console.error(`[smoke-pdf] dev server at ${BASE} unreachable — start with: pnpm dev:hoa`)
    process.exit(1)
  }

  // dev-login establishes the session cookie. Follow redirects so we
  // end up back at /, then keep the same fetch cookies for the PDF
  // request. The route is gated by DEV_AUTOLOGIN=1 + DEV_AUTOLOGIN_EMAIL.
  const cookieJar: string[] = []
  await fetchWithCookies(
    `${BASE}/auth/dev-login?redirect=/accounting`,
    cookieJar,
  )

  const pdfRes = await fetchWithCookies(
    `${BASE}/api/accounting/board-packet/${period.id}`,
    cookieJar,
  )
  check(`HTTP 200`, pdfRes.status === 200, `got ${pdfRes.status}`)
  if (pdfRes.status !== 200) {
    const errBody = await pdfRes.text().catch(() => '')
    console.error(`response body: ${errBody.slice(0, 200)}`)
    process.exit(1)
  }

  const ct = pdfRes.headers.get('content-type') ?? ''
  check(`content-type application/pdf`, ct === 'application/pdf', `got "${ct}"`)

  const cd = pdfRes.headers.get('content-disposition') ?? ''
  check(`content-disposition attachment`, cd.startsWith('attachment'), cd)

  const ab = await pdfRes.arrayBuffer()
  const bytes = new Uint8Array(ab)
  check(`body ≥ 1 KB`, bytes.length >= 1024, `got ${bytes.length} bytes`)

  // PDF magic bytes: %PDF- (0x25 0x50 0x44 0x46 0x2D).
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4])
  check(`%PDF- magic header`, magic === '%PDF-', `got "${magic}"`)

  // PDFs end with %%EOF — defensive sanity check that PDFKit closed
  // the document cleanly.
  const tail = String.fromCharCode(
    ...bytes.slice(Math.max(0, bytes.length - 8)),
  )
  check(`%%EOF trailer present`, tail.includes('%%EOF'), `tail="${tail}"`)

  if (process.env.SMOKE_PDF_WRITE !== '0') {
    const outPath = '/tmp/board-packet-smoke.pdf'
    writeFileSync(outPath, bytes)
    console.log(`\n[smoke-pdf] wrote ${outPath} (${bytes.length} bytes) — open it to eyeball formatting`)
  }

  console.log(`\n[smoke-pdf] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

async function fetchWithCookies(
  url: string,
  jar: string[],
  init: RequestInit = {},
  hops = 0,
): Promise<Response> {
  // Always use manual redirect handling — undici's `redirect: 'follow'`
  // doesn't propagate our cookie jar across hops, so dev-login → /
  // → /login chains forever. We replay set-cookie ourselves on each hop.
  const headers = new Headers(init.headers ?? {})
  if (jar.length > 0) headers.set('cookie', jar.join('; '))
  const res = await fetch(url, { ...init, headers, redirect: 'manual' })
  const setCookies = res.headers.getSetCookie?.() ?? []
  for (const c of setCookies) {
    const [pair] = c.split(';')
    if (!pair) continue
    // Replace the existing entry for this cookie name so we don't
    // accumulate duplicates that drown out the latest value.
    const name = pair.split('=')[0]
    const i = jar.findIndex((j) => j.startsWith(`${name}=`))
    if (i >= 0) jar[i] = pair.trim()
    else jar.push(pair.trim())
  }
  // Chase the redirect manually (cap at 5 hops to avoid infinite loops).
  if (res.status >= 300 && res.status < 400 && hops < 5) {
    const loc = res.headers.get('location')
    if (loc) {
      const next = new URL(loc, BASE).toString()
      return fetchWithCookies(next, jar, init, hops + 1)
    }
  }
  return res
}

main().catch((err) => {
  console.error('[smoke-pdf] crashed:', err)
  process.exit(1)
})
