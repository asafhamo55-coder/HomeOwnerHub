/**
 * scripts/scrape-state-law.ts
 *
 * Playwright-driven scraper for state HOA statutes. Writes the result
 * to data/statutes/<state>.scraped.jsonl — same JSONL shape as the
 * curated seed — and (optionally) re-runs the existing ingester to
 * push to Supabase.
 *
 * The decision to scrape into JSONL instead of upserting directly is
 * deliberate: the JSONL file is a checked-in diff target. You can see
 * exactly what Justia changed before it lands in the DB, and we can
 * always fall back to a hand-curated seed if a section starts coming
 * back malformed.
 *
 * Usage (from repo root):
 *
 *   # Dry run — fetch, parse, write JSONL only (no DB writes):
 *   pnpm scrape:state-law GA
 *
 *   # Fetch, write JSONL, then ingest into Supabase:
 *   pnpm scrape:state-law GA --apply
 *
 *   # Skip already-fresh sections (within 30 days):
 *   pnpm scrape:state-law GA --skip-fresh
 *
 * Requires: `pnpm add -D playwright -w` and `pnpm exec playwright
 * install chromium` (one-time, ~150MB download).
 *
 * Known limitation — Justia sits behind Cloudflare. We use a real
 * Chromium with a stock UA and small randomized jitter between
 * requests. If Cloudflare starts challenging anyway, switch to a
 * residential-proxy provider or a Browserless / ScrapingBee endpoint
 * (those terminate the challenge for you). The code below is
 * structured so that swap is a single function change in
 * `fetchPage()`.
 *
 * ToS caveat — Justia's robots permits scraping for indexing. We do
 * NOT republish the full text; we use it as the source for our
 * paraphrased summaries in state_statutes.body. Treat the .scraped
 * JSONL as a working artifact, not as content for the app.
 */

import './_load-env'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium as chromiumExtra } from 'playwright-extra'
import { chromium as chromiumPw, type Browser, type Page } from 'playwright'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — no types shipped
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { sourcesFor, type StateLawSource } from './state-law-sources'

// Stealth masks navigator.webdriver, chrome.runtime, plugin/language
// arrays, and ~15 other browser-fingerprint surfaces Cloudflare reads.
// Only applies to the local-Chromium path; when going via Browserless,
// they handle automation evasion server-side.
chromiumExtra.use(StealthPlugin())

const SUPPORTED_STATES = new Set(['GA', 'FL', 'CA', 'TX'])

// Stock recent-Chrome UA. Don't ship a "playwright" UA — Cloudflare
// blocks anything with `HeadlessChrome` in the UA.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'

interface ScrapedRecord {
  code_citation: string
  title: string
  category: string
  body: string
  source_url: string
  effective_date: string | null
  /** ISO timestamp when this record was scraped. */
  fetched_at: string
}

interface Args {
  state: string
  apply: boolean
  skipFresh: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const state = (argv[0] ?? '').toUpperCase()
  return {
    state,
    apply: argv.includes('--apply'),
    skipFresh: argv.includes('--skip-fresh'),
  }
}

async function main(): Promise<void> {
  const { state, apply, skipFresh } = parseArgs()
  if (!SUPPORTED_STATES.has(state)) {
    console.error(`[scrape] Usage: pnpm scrape:state-law <GA|FL|CA|TX> [--apply] [--skip-fresh]`)
    process.exit(1)
  }

  const sources = sourcesFor(state)
  if (sources.length === 0) {
    console.warn(`[scrape] No sources catalogued for ${state}. Add entries to scripts/state-law-sources.ts.`)
    return
  }

  console.log(`[scrape] ${state}: ${sources.length} URLs queued`)
  if (skipFresh) console.log(`[scrape] --skip-fresh enabled — sections fetched within 30d will be reused`)
  if (apply) console.log(`[scrape] --apply enabled — JSONL will be ingested into Supabase after scrape`)

  const outDir = path.resolve(process.cwd(), 'data/statutes')
  await fs.mkdir(outDir, { recursive: true })
  const outPath = path.join(outDir, `${state.toLowerCase()}.scraped.jsonl`)

  // Read existing JSONL so --skip-fresh can short-circuit fresh rows.
  const existing = await readExisting(outPath)

  const browser = await launchBrowser()
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
    // A referer makes the request look like normal navigation, not a
    // direct bot-style hit.
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Sec-Ch-Ua': '"Chromium";v="123", "Not:A-Brand";v="8"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"macOS"',
    },
  })

  const results: ScrapedRecord[] = []
  let scraped = 0
  let reused = 0
  let failed = 0
  let consecutiveFailures = 0

  try {
    for (const src of sources) {
      // Fail-fast: if the first 3 URLs all fail, the site is blocking
      // us — stop wasting time on the remaining 23.
      if (consecutiveFailures >= 3 && scraped === 0) {
        console.warn(`[scrape] 3 consecutive failures with 0 successes — aborting early.`)
        break
      }

      const cached = existing.get(src.code_citation)
      if (skipFresh && cached && isFresh(cached.fetched_at, 30)) {
        results.push(cached)
        reused += 1
        continue
      }

      const page = await ctx.newPage()
      try {
        const body = await scrapeSection(page, src)
        if (!body || body.length < 80) {
          console.warn(`[scrape] ${src.code_citation}: body too short (${body?.length ?? 0} chars), skipping`)
          failed += 1
          consecutiveFailures += 1
          continue
        }
        const rec: ScrapedRecord = {
          code_citation: src.code_citation,
          title: src.title,
          category: src.category,
          body,
          source_url: src.url,
          effective_date: null,
          fetched_at: new Date().toISOString(),
        }
        results.push(rec)
        scraped += 1
        consecutiveFailures = 0
        console.log(`[scrape] ${src.code_citation}: ${body.length} chars`)
      } catch (err) {
        failed += 1
        consecutiveFailures += 1
        console.error(`[scrape] ${src.code_citation}: ${(err as Error).message}`)
      } finally {
        await page.close()
      }

      // Small randomized jitter — friendlier to Justia, less suspicious.
      await sleep(800 + Math.random() * 1200)
    }
  } finally {
    await browser.close()
  }

  // Write the JSONL — append-style, one record per line, sorted by citation
  // for stable diffs.
  results.sort((a, b) => a.code_citation.localeCompare(b.code_citation))
  const jsonl = results.map((r) => JSON.stringify(r)).join('\n') + '\n'
  await fs.writeFile(outPath, jsonl, 'utf-8')

  console.log(
    `[scrape] done — scraped ${scraped}, reused ${reused}, failed ${failed}. Wrote ${outPath}`,
  )

  if (failed > 0) {
    console.warn(`[scrape] ${failed} sections failed. Cloudflare may be challenging. Re-run, or fall back to curated seed.`)
  }

  if (apply) {
    // Copy .scraped.jsonl → <state>.jsonl so the existing ingester
    // picks it up. We keep the .scraped file around for diffing.
    const ingestPath = path.join(outDir, `${state.toLowerCase()}.jsonl`)
    await fs.copyFile(outPath, ingestPath)
    console.log(`[scrape] --apply: copied to ${ingestPath}, invoking ingester...`)
    await runIngester(state)
  } else {
    console.log(`[scrape] dry run — re-run with --apply to upsert into Supabase.`)
  }
}

// ───────────────────────── browser launch ─────────────────────────

/**
 * Picks the browser path based on env:
 *
 *   - If BROWSERLESS_TOKEN is set, connects to Browserless's hosted
 *     Chromium over WebSocket. Browserless runs the browser on their
 *     infra with residential IPs that Cloudflare doesn't block. Plain
 *     `playwright` (no stealth) — Browserless handles evasion server-
 *     side, and the local stealth plugin can't apply to a remote
 *     browser anyway.
 *
 *   - Otherwise launches local Chromium with the stealth plugin. This
 *     is the path that gets 403'd by Justia's Cloudflare — kept as a
 *     fallback for sites that don't have aggressive bot detection.
 *
 * The downstream code is identical for both paths (it just sees a
 * Browser).
 */
async function launchBrowser(): Promise<Browser> {
  const token = process.env.BROWSERLESS_TOKEN
  if (token) {
    // Browserless v2 splits protocols by path:
    //   /                     — CDP (for puppeteer.connect)
    //   /playwright/chromium  — Playwright protocol (for chromium.connect)
    // We use Playwright, so we need the Playwright path. Earlier we
    // hit the bare endpoint and chromium.connect() hung silently
    // waiting for a Playwright handshake that CDP would never send.
    const base = process.env.BROWSERLESS_ENDPOINT
      ?? 'wss://production-sfo.browserless.io'
    // stealth=true: server-side fingerprint masking (Browserless's
    //   equivalent of the stealth plugin, applied to their own browser
    //   process). Free on most plans.
    // headless=false: forces Browserless's stealth mode to use a real
    //   Chromium binary (not headless shell) which presents a more
    //   normal fingerprint.
    const url = `${base}/playwright/chromium?token=${token}&stealth=true&headless=false`
    console.log(`[scrape] using Browserless (${base})`)
    console.log(`[scrape] connecting WebSocket... (token length=${token.length})`)
    try {
      // 30s connect timeout — silent hangs are unacceptable.
      const browser = await chromiumPw.connect(url, { timeout: 30_000 })
      console.log(`[scrape] Browserless connected ✓`)
      browser.on('disconnected', () => {
        console.error(`[scrape] Browserless disconnected unexpectedly`)
      })
      return browser
    } catch (err) {
      console.error(`[scrape] Browserless connect FAILED: ${(err as Error).message}`)
      console.error(`[scrape] If still failing, try BROWSERLESS_ENDPOINT=wss://chrome.browserless.io in .env.local`)
      throw err
    }
  }
  console.log('[scrape] using local Chromium with stealth plugin')
  return await chromiumExtra.launch({ headless: true })
}

// ───────────────────────── DOM extraction ──────────────────────────

/**
 * Pulls the statute body text out of a Justia page.
 *
 * Justia's section pages put the codified text inside a div with class
 * `codes-content` (or `section-content` on older pages). We grab the
 * text of that element, strip Justia's own boilerplate (Annotations,
 * Disclaimer, etc.), and return what's left.
 *
 * If the selectors stop matching (Justia ships a redesign), the
 * function returns '' and we surface the failure as a per-section
 * warning rather than aborting the whole run.
 */
async function scrapeSection(page: Page, src: StateLawSource): Promise<string> {
  // domcontentloaded fires when the HTML is parsed — fast. Some
  // Cloudflare protected pages serve a challenge that never settles
  // network requests (long-poll), so networkidle deadlocks. We then
  // wait separately for the statute selector, capped short.
  const resp = await page.goto(src.url, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  if (!resp) throw new Error('no response')
  if (resp.status() >= 400) {
    throw new Error(`HTTP ${resp.status()}`)
  }

  // Wait for the statute body. If a Cloudflare challenge page is
  // serving instead, this will time out — at which point we dump the
  // raw HTML for the first failure so we can diagnose.
  const found = await page
    .waitForSelector('.codes-content, .section-content, .content', { timeout: 8_000 })
    .then(() => true)
    .catch(() => false)

  if (!found) {
    // Diagnostic: capture the first failed page so we can see what
    // Cloudflare is actually serving (challenge HTML vs unknown layout).
    const html = await page.content()
    const diagPath = path.resolve(process.cwd(), 'data/statutes/_last-failure.html')
    await fs.writeFile(diagPath, html, 'utf-8').catch(() => {})
    throw new Error(`selector miss (HTML dumped to ${diagPath})`)
  }

  return await page.evaluate(() => {
    // Try the modern selector first, then older fallbacks.
    const selectors = ['.codes-content', '.section-content', 'main .content', '#content']
    let root: Element | null = null
    for (const sel of selectors) {
      root = document.querySelector(sel)
      if (root) break
    }
    if (!root) return ''

    // Remove navigation, related links, Justia annotations, share
    // buttons, ads — anything that isn't the statute itself.
    const dropSelectors = [
      'nav',
      'aside',
      '.share',
      '.annotations',
      '.related',
      '.breadcrumbs',
      '.justia-disclaimer',
      'script',
      'style',
      'noscript',
      'a[href*="lawyers"]',
    ]
    for (const sel of dropSelectors) {
      root.querySelectorAll(sel).forEach((el) => el.remove())
    }

    const text = (root.textContent ?? '').replace(/\s+/g, ' ').trim()
    return text
  })
}

// ───────────────────────── helpers ─────────────────────────────────

async function readExisting(filepath: string): Promise<Map<string, ScrapedRecord>> {
  const map = new Map<string, ScrapedRecord>()
  try {
    const raw = await fs.readFile(filepath, 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const rec = JSON.parse(trimmed) as ScrapedRecord
        map.set(rec.code_citation, rec)
      } catch {
        /* skip malformed lines */
      }
    }
  } catch {
    /* file doesn't exist yet — first run */
  }
  return map
}

function isFresh(iso: string, days: number): boolean {
  const fetched = new Date(iso).getTime()
  if (!Number.isFinite(fetched)) return false
  return Date.now() - fetched < days * 24 * 60 * 60 * 1000
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function runIngester(state: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'pnpm',
      ['exec', 'tsx', 'scripts/ingest-state-statutes.ts', state],
      { stdio: 'inherit' },
    )
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ingester exited with code ${code}`))
    })
  })
}

// Catch anything that escapes the main() promise — including async
// errors thrown from event handlers (e.g. browser.on('disconnected')).
process.on('unhandledRejection', (reason) => {
  console.error('[scrape] unhandled rejection:', reason)
  process.exit(1)
})
process.on('uncaughtException', (err) => {
  console.error('[scrape] uncaught exception:', err)
  process.exit(1)
})

main().catch((err) => {
  console.error('[scrape] fatal:', err)
  console.error('[scrape] stack:', (err as Error)?.stack ?? '(no stack)')
  process.exit(1)
})
