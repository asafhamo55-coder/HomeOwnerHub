/** Throwaway repro: does the leases "Withdraw" button actually work? */
import './_load-env'
import { spawn, type ChildProcess } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { chromium } from 'playwright'

const PORT = Number(process.env.E2E_PORT ?? 3000)
const BASE = `http://localhost:${PORT}`
const sb = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const log = (...a: unknown[]) => console.log(...a)

async function waitForServer(timeoutMs = 120_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) })
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 1500))
  }
  throw new Error('dev server never became healthy')
}

async function main() {
  const { data: entry } = await sb
    .from('lease_waiting_list')
    .select('id, organization_id, property_id, status')
    .eq('status', 'waiting')
    .limit(1)
    .maybeSingle<{ id: string; organization_id: string; property_id: string; status: string }>()
  if (!entry) return log('no waiting entry to test with')
  log('target entry:', entry.id.slice(0, 8), 'org:', entry.organization_id.slice(0, 8))

  const { data: member } = await sb
    .from('org_members')
    .select('user_id, role, profiles(email)')
    .eq('org_id', entry.organization_id)
    .in('role', ['admin', 'board'])
    .limit(1)
    .maybeSingle<{ role: string; profiles: { email: string | null } | null }>()
  const adminEmail = member?.profiles?.email
  if (!adminEmail) return log('no admin/board member in that org')
  log('driving as:', member.role, adminEmail)

  try {
    await waitForServer()
    log('server healthy')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    page.on('console', (m) => {
      if (m.type() === 'error') log('  [browser error]', m.text().slice(0, 300))
    })
    page.on('pageerror', (e) => log('  [pageerror]', String(e).slice(0, 300)))

    await page.goto(`${BASE}/auth/dev-login?redirect=/leases`, { waitUntil: 'networkidle' })
    log('url:', page.url())

    const withdraw = page.getByRole('button', { name: /Withdraw/i }).first()
    await withdraw.waitFor({ state: 'visible', timeout: 20_000 })
    log('withdraw button visible')

    await withdraw.click()
    await page.waitForTimeout(1500)

    const dialogState = await page.evaluate(() => {
      const d = document.querySelector('dialog')
      if (!d) return { exists: false }
      const r = d.getBoundingClientRect()
      const cs = getComputedStyle(d)
      return {
        exists: true,
        open: d.open,
        rect: { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) },
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        text: (d.textContent || '').slice(0, 120),
      }
    })
    log('dialog after click:', JSON.stringify(dialogState))

    const confirmBtn = page.getByRole('button', { name: /^Withdraw$/ }).last()
    const dialogConfirm = page.locator('dialog button', { hasText: /^Withdraw$/ })
    if (await dialogConfirm.count()) {
      await dialogConfirm.first().click({ timeout: 5000 }).catch((e) => log('confirm click failed:', String(e).slice(0, 200)))
      log('clicked confirm inside dialog')
    } else {
      log('no confirm button found inside dialog')
    }
    await page.waitForTimeout(3000)

    const { data: after } = await sb
      .from('lease_waiting_list')
      .select('status, status_updated_at')
      .eq('id', entry.id)
      .single()
    log('DB status after flow:', JSON.stringify(after))

    const toastText = await page.evaluate(() => document.body.innerText.match(/withdrawn|error|permission/gi)?.slice(0, 5) ?? [])
    log('page keywords:', JSON.stringify(toastText))

    await browser.close()

    if ((after as any)?.status !== 'waiting') {
      await sb.from('lease_waiting_list').update({ status: 'waiting', status_updated_at: null, status_updated_by: null }).eq('id', entry.id)
      log('reverted test row to waiting')
    }
  } finally {
    /* using the already-running dev server */
  }
}
main().then(() => process.exit(0))
