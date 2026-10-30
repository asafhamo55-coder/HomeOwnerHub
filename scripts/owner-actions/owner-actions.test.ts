import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { blocksToHtml, blocksToText } from '../release-notes/lib/markdown'
import { renderOwnerActionsEmail, subjectFor } from './lib/email'
import { countUrgent, openItemsHash, OwnerActionsFormatError, parseOwnerActions } from './lib/parse'
import { readOwnerSendEnv, runOwnerActions } from './lib/run'

const DOC = `# Owner action items

Intro prose, not parsed.

## Why these need you

Claude cannot reach the **production database**.

## Open

### OA-2 · Rename the product

**Urgency:** Whenever

**Why it matters:** receipts show the old name.

### OA-1 · Apply migrations

**Urgency:** Urgent

**Why it matters:** webhook writes fail.

**Steps:**

1. Open \`docs/specs/x.sql\`
2. Run **PART 1**

### OA-3 · Add indexes

**Urgency:** Soon

- one at a time

## Done

### OA-4 · Set GitHub secrets

**Done:** 2026-10-17

## For Claude: keeping this file current

### OA-99 · not an item, this section is prose
`

const tmpDirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'oa-test-'))
  tmpDirs.push(d)
  return d
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

function docDir(md = DOC): string {
  const root = tmp()
  const file = path.join(root, 'docs', 'owner-actions.md')
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, md)
  return root
}

describe('parse', () => {
  it('splits open and done, urgent first, file order within a tier', () => {
    const a = parseOwnerActions(DOC)
    expect(a.open.map((i) => [i.id, i.urgency])).toEqual([
      ['OA-1', 'Urgent'],
      ['OA-3', 'Soon'],
      ['OA-2', 'Whenever'],
    ])
    expect(a.done.map((i) => [i.id, i.doneOn])).toEqual([['OA-4', '2026-10-17']])
    expect(countUrgent(a.open)).toBe(1)
    expect(a.why).toContain('production database')
  })

  it('strips the Urgency line from the body and keeps the rest', () => {
    const oa1 = parseOwnerActions(DOC).open[0]!
    expect(oa1.title).toBe('Apply migrations')
    expect(oa1.body).not.toContain('Urgency')
    expect(oa1.body).toContain('**Steps:**')
  })

  it.each([
    ['an open item without urgency', DOC.replace('**Urgency:** Soon\n', ''), /OA-3: open item has no/],
    ['an unknown urgency', DOC.replace('**Urgency:** Soon', '**Urgency:** Later'), /unknown urgency "Later"/],
    ['a duplicate id', DOC.replace('### OA-4 ·', '### OA-1 ·'), /OA-1 appears more than once/],
    ['a heading without an id', DOC.replace('### OA-3 · Add indexes', '### Add indexes'), /heading is not/],
    ['no Open section', DOC.replace('## Open', '## Pending'), /no "## Open" section/],
    ['no Done section', DOC.replace('## Done', '## Finished'), /no "## Done" section/],
  ])('refuses %s', (_label, md, msg) => {
    expect(() => parseOwnerActions(md)).toThrow(OwnerActionsFormatError)
    expect(() => parseOwnerActions(md)).toThrow(msg)
  })

  it('hashes open items only: prose and Done edits do not change it, open edits do', () => {
    const h = openItemsHash(parseOwnerActions(DOC).open)
    expect(h).toMatch(/^[0-9a-f]{16}$/)
    expect(openItemsHash(parseOwnerActions(DOC.replace('Intro prose', 'Other prose')).open)).toBe(h)
    expect(openItemsHash(parseOwnerActions(DOC.replace('2026-10-17', '2026-10-18')).open)).toBe(h)
    expect(openItemsHash(parseOwnerActions(DOC.replace('one at a time', 'all at once')).open)).not.toBe(h)
    expect(openItemsHash(parseOwnerActions(DOC.replace('**Urgency:** Soon', '**Urgency:** Urgent')).open)).not.toBe(h)
  })

  it('the real docs/owner-actions.md parses, and the migrations item (OA-1) is Done', () => {
    // The owner applied every migration on 2026-10-20, so no item needs to
    // be urgent any more — this pins only that the real file parses and
    // that OA-1 (the SQL runbook) sits in Done, not which open item leads.
    const real = readFileSync(fileURLToPath(new URL('../../docs/owner-actions.md', import.meta.url)), 'utf8')
    const a = parseOwnerActions(real)
    expect(a.open.length).toBeGreaterThan(0)
    const oa1 = a.done.find((i) => i.id === 'OA-1')
    expect(oa1).toBeDefined()
    expect(oa1!.body).toContain('docs/specs/2026-10-16-rls-sweep-apply.sql')
    expect(a.open.some((i) => i.id === 'OA-1')).toBe(false)
    expect(a.why).toContain('/permissions')
    // The repo is public: no key-shaped strings in the checklist.
    expect(real).not.toMatch(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{8,}|\bre_[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}/)
  })
})

describe('markdown: numbered steps', () => {
  it('renders 1. lines as an ordered list, separate from bullets', () => {
    const html = blocksToHtml('1. first\n2. second\n- bullet')
    expect(html).toMatch(/<ol[^>]*>.*first.*second.*<\/ol>/s)
    expect(html).toMatch(/<ul[^>]*>.*bullet.*<\/ul>/s)
    expect(blocksToText('1. a\n2. b')).toBe('  1. a\n  2. b')
  })
})

describe('render', () => {
  it('subject counts open and urgent items', () => {
    const a = parseOwnerActions(DOC)
    expect(subjectFor(a)).toBe('HomeownerHub: 3 things need you (1 urgent)')
    const one = parseOwnerActions(DOC.replace(/### OA-[23][\s\S]*?(?=### OA-1|## Done)/g, ''))
    expect(subjectFor(one)).toBe('HomeownerHub: 1 thing needs you (1 urgent)')
  })

  it('branded HTML: wordmark, blue, pills, steps, done list; text part too', () => {
    const e = renderOwnerActionsEmail(parseOwnerActions(DOC), { branch: 'claude/quality-oracle' })
    expect(e.html).toContain('Homeowner<span')
    expect(e.html).toContain('#4B27C9')
    expect(e.html).toContain('Owner actions')
    expect(e.html.indexOf('Apply migrations')).toBeLessThan(e.html.indexOf('Add indexes'))
    expect(e.html).toMatch(/>Urgent<\/span>/)
    expect(e.html).toContain('<ol')
    expect(e.html).toContain('Done (1)')
    expect(e.html).toContain('/blob/claude/quality-oracle/docs/owner-actions.md')
    expect(e.html).not.toContain('OA-99')
    expect(e.text).toContain('[URGENT] OA-1 · Apply migrations')
    expect(e.text).toContain('  1. Open docs/specs/x.sql')
  })

  it('escapes markup in titles and bodies', () => {
    const e = renderOwnerActionsEmail(parseOwnerActions(DOC.replace('Add indexes', '<script>x</script>')))
    expect(e.html).not.toContain('<script>')
    expect(e.html).toContain('&lt;script&gt;')
  })
})

describe('send', () => {
  const FULL_ENV = {
    RESEND_API_KEY: 're_test_key',
    OWNER_ACTIONS_TO: 'owner@example.com',
    RELEASE_NOTES_FROM: 'HomeownerHub <noreply@example.com>',
    // Must be ignored: owner actions never go to the release-notes list.
    RELEASE_NOTES_TO: 'team@example.com',
  }
  function okFetch() {
    return vi.fn(async () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }))
  }

  it.each([['RESEND_API_KEY'], ['OWNER_ACTIONS_TO'], ['RELEASE_NOTES_FROM']])(
    'refuses with exit 2 and sends nothing when %s is missing',
    async (missing) => {
      const env: Record<string, string> = { ...FULL_ENV }
      delete env[missing]
      const fetchMock = okFetch()
      const lines: string[] = []
      const code = await runOwnerActions([], { env, cwd: docDir(), fetch: fetchMock, log: (l) => lines.push(l) })
      expect(code).toBe(2)
      expect(fetchMock).not.toHaveBeenCalled()
      expect(lines.join('\n')).toContain(missing)
    },
  )

  it('sends to OWNER_ACTIONS_TO only, with the idempotency key and owner_actions tag', async () => {
    const fetchMock = okFetch()
    const lines: string[] = []
    const code = await runOwnerActions(['--idempotency-key', 'owner-actions-abc'], {
      env: FULL_ENV,
      cwd: docDir(),
      fetch: fetchMock,
      log: (l) => lines.push(l),
    })
    expect(code).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.to).toEqual(['owner@example.com'])
    expect(body.subject).toBe('HomeownerHub: 3 things need you (1 urgent)')
    expect(body.tags).toEqual([{ name: 'category', value: 'owner_actions' }])
    expect(JSON.stringify(body)).not.toContain('team@example.com')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('owner-actions-abc')
    // No PII in logs.
    expect(lines.join('\n')).not.toContain('owner@example.com')
  })

  it('refuses recipient flags outright', async () => {
    const fetchMock = okFetch()
    for (const flag of ['--to', '--cc', '--bcc', '--from']) {
      expect(await runOwnerActions([flag, 'x@example.com'], { env: FULL_ENV, cwd: docDir(), fetch: fetchMock })).toBe(2)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send when nothing is open', async () => {
    const empty = DOC.replace(/## Open[\s\S]*?(?=## Done)/, '## Open\n\n')
    const fetchMock = okFetch()
    const lines: string[] = []
    expect(await runOwnerActions([], { env: FULL_ENV, cwd: docDir(empty), fetch: fetchMock, log: (l) => lines.push(l) })).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('Nothing open')
  })

  it('refuses a malformed checklist with exit 2', async () => {
    const fetchMock = okFetch()
    const bad = DOC.replace('**Urgency:** Soon\n', '')
    expect(await runOwnerActions([], { env: FULL_ENV, cwd: docDir(bad), fetch: fetchMock })).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('--dry-run writes the HTML and sends nothing, with no secrets', async () => {
    const root = docDir()
    const out = path.join(root, 'out', 'oa.html')
    const fetchMock = okFetch()
    expect(await runOwnerActions(['--dry-run', '--out', out], { env: {}, cwd: root, fetch: fetchMock })).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(readFileSync(out, 'utf8')).toContain('Apply migrations')
  })

  it('--summary prints open/urgent/hash; --allow-missing covers a file that did not exist yet', async () => {
    const lines: string[] = []
    expect(await runOwnerActions(['--summary'], { env: {}, cwd: docDir(), log: (l) => lines.push(l) })).toBe(0)
    expect(lines).toEqual(['open=3', 'urgent=1', `hash=${openItemsHash(parseOwnerActions(DOC).open)}`])
    const missing: string[] = []
    const root = tmp()
    expect(await runOwnerActions(['--summary', '--allow-missing'], { env: {}, cwd: root, log: (l) => missing.push(l) })).toBe(0)
    expect(missing).toEqual(['open=0', 'urgent=0', 'hash=none'])
    expect(existsSync(path.join(root, 'docs'))).toBe(false)
    expect(await runOwnerActions(['--summary'], { env: {}, cwd: root })).toBe(2)
  })

  it('reports a Resend failure with exit 1 and no address in the message', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ name: 'validation_error', message: 'owner@example.com is bad' }), { status: 422 }),
    )
    const lines: string[] = []
    expect(await runOwnerActions([], { env: FULL_ENV, cwd: docDir(), fetch: fetchMock, log: (l) => lines.push(l) })).toBe(1)
    expect(lines.join('\n')).toContain('owner-actions email: HTTP 422 (validation_error)')
    expect(lines.join('\n')).not.toContain('owner@example.com')
  })

  it('treats a Resend idempotency conflict (409) as already sent', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'invalid_idempotent_request' }), { status: 409 }))
    const lines: string[] = []
    expect(
      await runOwnerActions(['--idempotency-key', 'k'], { env: FULL_ENV, cwd: docDir(), fetch: fetchMock, log: (l) => lines.push(l) }),
    ).toBe(0)
    expect(lines.join('\n')).toContain('Already sent')
  })

  it('readOwnerSendEnv names OWNER_ACTIONS_TO, not RELEASE_NOTES_TO', () => {
    expect(() => readOwnerSendEnv({ RESEND_API_KEY: 'k', RELEASE_NOTES_FROM: 'a@b.co', RELEASE_NOTES_TO: 'x@y.co' })).toThrow(
      /OWNER_ACTIONS_TO is not set/,
    )
  })
})
