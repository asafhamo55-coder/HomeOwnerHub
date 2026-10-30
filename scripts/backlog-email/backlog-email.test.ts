import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderBacklogEmail, subjectFor } from './lib/email'
import { BacklogFormatError, countPartly, openItemsHash, parseBacklog, scrub } from './lib/parse'
import { OWNER_EMAIL, readBacklogSendEnv, runBacklogEmail } from './lib/run'

// One of every shape docs/backlog.md uses.
const DOC = `# HOA Hub product backlog (ranked)

## Priorities (re-ranked)

1. **BL-001:** superseded list, never parsed.

## Summary table

| Rank | ID | Title | Imp | Conf | Eff | **Score** | Mig | Keys | Bucket |
|---|---|---|---|---|---|---|---|---|---|
| 1 | BL-001 | Pricing | 5 | 0.6 | 0.5 | **6.00** | no | no | **Done (337456a3)** |
| 2 | BL-002 | Marketing pass | 3 | 1.0 | 0.5 | **6.00** | no | no | **Done (c2)** |
| 3 | BL-003 | RLS hole | 4 | 0.9 | 1.5 | **2.40** | **yes (M1)** | no | Open (0063) |
| 4 | BL-004 | Analytics | 3 | 0.8 | 1 | **2.40** | no | **yes** | **Partly (bdfa759f)** |

## Now (next 2 cycles)

### BL-001 — Pricing scenarios
- **Groomed 2026-10-20:** Done: scenarios 337456a3.
- **User value:** a board can afford us.

### BL-002 — Marketing truth pass
- **User value:** claims match features.

### BL-003 — Close the RLS hole (migration batch M1)
- **Groomed 2026-10-20:** Open, needs migration 0063: waits for Asaf.
- **User value:** a resident can't read a neighbour's dues. More detail here.

### BL-004 — Privacy-safe product analytics
- **Groomed 2026-10-20:** Partly done: the beacon exists. Remaining: wire page views and the 8 named events.
- **User value:** we learn which features boards use.

## Added 2026-10-15 (cycle 1)

- **BL-010 Implement the old pricing** — **superseded 2026-10-20 by BL-020**:
  - **Groomed 2026-10-20:** Obsolete: superseded by BL-020.
- **BL-011 Association-timezone "today" — Done (c7)** (found by the c2 date fix): dates are UTC.
- **BL-012 Board packet follow-ups — Done except the Safari check** (from BL-016): the packet month.
  - **Groomed 2026-10-20:** Partly done (cf72c358). Remaining: the Safari print check needs a human.
- **BL-013 Document visibility (migration, batch M1)** (from BL-049): residents can read every
  - **Groomed 2026-10-20:** Open, needs migration M1: UI built behind the flag.
  row of their org. Add a board-set column.
- **BL-014 Confirm the Message-ID:** send one real communication and check the reply. Also see OA-9.
- **BL-015 Old duplicate, not yet done:** the earlier write-up.

## Ranked open work (groomed 2026-10-20)

1. ~~**Invoices become bill proposals** (BL-012 leftover).~~ **Done 2026-10-20** (see BL-012).
2. **California statute text ingestion** (BL-030, adapter part only). A CA adapter reading the bulk data (Civ. Code §§ 4000–6150), so CA letters quote verbatim text.
3. **Cap the AI routes** (BL-015). Measure per-call cost.
4. **Georgia statute text** (BL-030, adapters). Same pattern for GA Title 44 ch. 3.
- **BL-015 Old duplicate (Done 2026-10-20: shipped):** the later write-up.

## Ranked open work — round 2 (2026-10-20)

1. **BL-020 ARC decision clock. (Done 2026-10-20: setting, chips)** Per-association setting.
2. **BL-021 Meeting notice to owners.** "Send notice" prefills the composer.

## Security review 2026-10-20 (today's merges)
- **SEC-H1 (High, fixing):** not a backlog item. BL-099 mentioned here is ignored.

## Ranked open work — round 3 (2026-10-21)

1. **BL-030 Monthly state-law sync.** Migration: **yes (M2)**. Effort M. Score 1.33.
   - **Pain:** boards never hear when the law changes.
2. **BL-031 Fine hearing workflow.** Migration: no.
   - **Pain:** fines collapse.
   - **First part built behind \`M4_APPLIED\`:** the hearing record. Not yet: a hard block on levying.
3. **BL-032 Director certification tracker.** Migration: no.
   - **Status (2026-10-21): built, no migration.** Signed records under compliance settings.
4. **BL-033 Insurance tracker.** Migration: no.
   - **Pain:** premiums are up 3x for <b>boards</b>.
   - **Blocked on:** **a real export file from the owner.**
5. **BL-034 Exempt opening charges from late fees:** opening charges get a due date. **Built behind \`M3_APPLIED\`**: the executor marks its charges.
6. **BL-035 Refresh the Georgia snapshot before 2027-01-01 (deadline item):** SB 406 takes effect 2027-01-01.

**Below the line:**
- Resident preferences UI (no id, not counted).
`

const OWNER_ACTIONS = `# Owner actions

## Open

### OA-9 · Load the law

**Urgency:** Soon

Do it.

## Done

### OA-1 · Old

**Done:** 2026-10-20
`

const tmpDirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'bl-test-'))
  tmpDirs.push(d)
  return d
}
afterEach(() => {
  while (tmpDirs.length) rmSync(tmpDirs.pop()!, { recursive: true, force: true })
})

function docDir(md = DOC, ownerActions: string | null = OWNER_ACTIONS): string {
  const root = tmp()
  mkdirSync(path.join(root, 'docs'), { recursive: true })
  writeFileSync(path.join(root, 'docs', 'backlog.md'), md)
  if (ownerActions !== null) writeFileSync(path.join(root, 'docs', 'owner-actions.md'), ownerActions)
  return root
}

function byKey(md = DOC, oa: string[] = ['OA-9']) {
  const b = parseBacklog(md, oa)
  return { b, get: (k: string) => [...b.open, ...b.closed].find((i) => i.key === k) }
}

describe('parse: open vs done', () => {
  it('finds every BL item and keeps only the not-done ones open', () => {
    const { b } = byKey()
    expect(b.open.map((i) => i.key).sort()).toEqual(
      ['BL-003', 'BL-004', 'BL-012', 'BL-013', 'BL-014', 'BL-021', 'BL-030', 'BL-030#1', 'BL-030#2', 'BL-031', 'BL-033', 'BL-035'].sort(),
    )
    expect(b.closed.map((i) => i.key).sort()).toEqual(
      ['BL-001', 'BL-002', 'BL-010', 'BL-011', 'BL-012#1', 'BL-015', 'BL-020', 'BL-032', 'BL-034'].sort(),
    )
  })

  it.each([
    ['BL-001', 'done', 'Groomed: Done'],
    ['BL-002', 'done', 'summary-table bucket only'],
    ['BL-003', 'open', 'Groomed: Open beats nothing'],
    ['BL-004', 'partly', 'Groomed: Partly done'],
    ['BL-010', 'obsolete', 'superseded'],
    ['BL-011', 'done', '"— Done (c7)" in the bold lead'],
    ['BL-012', 'partly', '"Done except" in the bold lead'],
    ['BL-012#1', 'done', 'struck-through round-1 part'],
    ['BL-015', 'done', 'written up twice: done wins'],
    ['BL-020', 'done', '(Done ...) in a round lead'],
    ['BL-021', 'open', 'round lead with no status'],
    ['BL-031', 'partly', 'built behind a flag with "Not yet:"'],
    ['BL-032', 'done', 'Status line says built'],
    ['BL-034', 'done', '**Built behind** with nothing left'],
  ] as const)('%s is %s (%s)', (key, status, _why) => {
    expect(byKey().get(key)?.status).toBe(status)
  })

  it('labels: partly, migration, keys, blocked, open owner actions, deadline, part-of', () => {
    const { get } = byKey()
    expect(get('BL-003')?.labels).toEqual(['Needs migration 0063'])
    expect(get('BL-004')?.labels).toEqual(['Partly done', 'Needs keys'])
    expect(get('BL-013')?.labels).toEqual(['Needs migration M1'])
    expect(get('BL-014')?.labels).toEqual(['Blocked on OA-9'])
    expect(get('BL-030')?.labels).toEqual(['Needs migration M2'])
    expect(get('BL-033')?.labels).toEqual(['Blocked on a real export file from the owner'])
    expect(get('BL-035')?.labels).toEqual(['Deadline 2027-01-01'])
    expect(get('BL-030#1')?.labels).toEqual(['Part of BL-030'])
    // A done owner action is not a blocker.
    expect(byKey(DOC, []).get('BL-014')?.labels).toEqual([])
  })

  it('titles drop the id and status; summaries are one line of what it is or what is left', () => {
    const { get } = byKey()
    expect(get('BL-011')?.title).toBe('Association-timezone "today"')
    expect(get('BL-020')?.title).toBe('ARC decision clock')
    expect(get('BL-003')?.summary).toBe("a resident can't read a neighbour's dues")
    expect(get('BL-004')?.summary).toBe('Left: wire page views and the 8 named events')
    expect(get('BL-031')?.summary).toBe('Left: a hard block on levying')
    expect(get('BL-030')?.summary).toBe('boards never hear when the law changes')
    // Wrapped lead lines rejoin across a Groomed line.
    expect(get('BL-013')?.summary).toBe('residents can read every row of their org')
    // "Civ. Code" is not a sentence end.
    expect(get('BL-030#1')?.summary).toContain('(Civ. Code §§ 4000–6150), so CA letters quote verbatim text')
  })

  it('groups: Georgia first, then the newest round first, then the earlier backlog', () => {
    const { b } = byKey()
    expect(b.groups.map((g) => g.name)).toEqual([
      'Georgia',
      'Round 3 (2026-10-21)',
      'Round 2 (2026-10-20)',
      'Round 1 (2026-10-20)',
      'Earlier backlog',
    ])
    expect(b.groups[0]!.items.map((i) => i.key)).toEqual(['BL-035', 'BL-030#2'])
    expect(b.open[0]!.key).toBe('BL-035')
  })

  it('skips the Priorities list and security reviews, and refuses a file with no items', () => {
    const { b } = byKey()
    expect([...b.open, ...b.closed].some((i) => i.id === 'BL-099')).toBe(false)
    expect(() => parseBacklog('# Nothing\n\n## Now\n\nNo items.\n')).toThrow(BacklogFormatError)
  })

  it('the hash covers open items only', () => {
    const base = openItemsHash(parseBacklog(DOC).open)
    expect(openItemsHash(parseBacklog(DOC.replace('a board can afford us', 'reworded')).open)).toBe(base)
    expect(openItemsHash(parseBacklog(DOC.replace('Meeting notice to owners.', 'Meeting notice to owners. (Done: abc)')).open)).not.toBe(base)
  })

  it('scrubs addresses and key-shaped tokens', () => {
    expect(scrub('mail a.b@example.com with sk_live_abc123 and re_ABCDEFGHIJKLMNOPQRST')).toBe('mail [address] with [key] and [key]')
  })
})

describe('the real docs/backlog.md', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  const md = readFileSync(path.join(root, 'docs', 'backlog.md'), 'utf8')
  const b = parseBacklog(md)

  it('parses, has open items, and keeps known-done items out', () => {
    expect(b.open.length).toBeGreaterThan(0)
    expect(b.closed.length).toBeGreaterThan(0)
    const open = new Set(b.open.map((i) => i.key))
    // Marked done in the file in different ways: table bucket, Groomed line, bold lead, Status line.
    for (const id of ['BL-001', 'BL-010', 'BL-108', 'BL-113', 'BL-139']) expect(open.has(id)).toBe(false)
    for (const i of b.open) {
      expect(i.id).toMatch(/^BL-\d{3}$/)
      expect(i.title.length).toBeGreaterThan(0)
      expect(['open', 'partly']).toContain(i.status)
    }
  })

  it('renders without addresses or secrets', () => {
    const e = renderBacklogEmail(b)
    expect(e.html).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
    expect(e.text).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
    expect(e.html).not.toMatch(/service[_ ]role|sk_live|eyJ[\w-]{20,}/i)
  })
})

describe('render', () => {
  it('subject and title card count open items and Georgia', () => {
    const b = parseBacklog(DOC, ['OA-9'])
    expect(subjectFor(b)).toBe('HomeownerHub: 12 backlog items left (2 Georgia)')
    const e = renderBacklogEmail(b)
    expect(e.html).toContain('12 backlog items left')
    expect(e.html).toContain(`${12 - countPartly(b.open)} not started, ${countPartly(b.open)} partly done`)
    expect(e.html).toContain('#4B27C9')
    expect(e.html).toContain('Blocked on OA-9')
    expect(e.text).toContain('GEORGIA (2)')
    expect(e.text).toContain('BL-035 · Refresh the Georgia snapshot before 2027-01-01 (deadline item)')
  })

  it('escapes markup from the backlog', () => {
    const e = renderBacklogEmail(parseBacklog(DOC))
    expect(e.html).not.toContain('<b>boards</b>')
    expect(e.html).toContain('&lt;b&gt;boards&lt;/b&gt;')
  })
})

describe('send', () => {
  const FULL_ENV = {
    RESEND_API_KEY: 're_test_key',
    OWNER_ACTIONS_TO: 'owner@example.com',
    RELEASE_NOTES_FROM: 'HomeownerHub <noreply@example.com>',
    // Must be ignored: the digest never goes to the release-notes list.
    RELEASE_NOTES_TO: 'team@example.com',
  }
  function okFetch() {
    return vi.fn(async () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }))
  }

  it.each([['RESEND_API_KEY'], ['RELEASE_NOTES_FROM']])('refuses with exit 2 and sends nothing when %s is missing', async (missing) => {
    const env: Record<string, string> = { ...FULL_ENV }
    delete env[missing]
    const fetchMock = okFetch()
    const lines: string[] = []
    expect(await runBacklogEmail([], { env, cwd: docDir(), fetch: fetchMock, log: (l) => lines.push(l) })).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain(missing)
  })

  it('sends to OWNER_ACTIONS_TO only, with the idempotency key and backlog_digest tag', async () => {
    const fetchMock = okFetch()
    const lines: string[] = []
    const code = await runBacklogEmail(['--idempotency-key', 'backlog-digest-abc'], {
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
    expect(body.subject).toBe('HomeownerHub: 12 backlog items left (2 Georgia)')
    expect(body.tags).toEqual([{ name: 'category', value: 'backlog_digest' }])
    expect(JSON.stringify(body)).not.toContain('team@example.com')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('backlog-digest-abc')
    expect(lines.join('\n')).not.toContain('owner@example.com')
  })

  it('falls back to the owner, and only the owner, when OWNER_ACTIONS_TO is unset', async () => {
    const env: Record<string, string> = { ...FULL_ENV }
    delete env.OWNER_ACTIONS_TO
    const fetchMock = okFetch()
    expect(await runBacklogEmail([], { env, cwd: docDir(), fetch: fetchMock })).toBe(0)
    const body = JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { to: string[] }
    expect(body.to).toEqual([OWNER_EMAIL])
    expect(readBacklogSendEnv({ RESEND_API_KEY: 'k', RELEASE_NOTES_FROM: 'a@b.co', RELEASE_NOTES_TO: 'x@y.co' }).to).toEqual([OWNER_EMAIL])
  })

  it('names OWNER_ACTIONS_TO, not RELEASE_NOTES_TO, when the recipient is malformed', () => {
    expect(() => readBacklogSendEnv({ RESEND_API_KEY: 'k', RELEASE_NOTES_FROM: 'a@b.co', OWNER_ACTIONS_TO: 'not-an-address' })).toThrow(
      /OWNER_ACTIONS_TO has 1 malformed address/,
    )
  })

  it('refuses recipient flags outright', async () => {
    const fetchMock = okFetch()
    for (const flag of ['--to', '--cc', '--bcc', '--from']) {
      expect(await runBacklogEmail([flag, 'x@example.com'], { env: FULL_ENV, cwd: docDir(), fetch: fetchMock })).toBe(2)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not send when nothing is open', async () => {
    const allDone = `## Now\n\n### BL-001 — Done thing\n- **Groomed 2026-10-20:** Done (abc).\n`
    const fetchMock = okFetch()
    const lines: string[] = []
    expect(await runBacklogEmail([], { env: FULL_ENV, cwd: docDir(allDone), fetch: fetchMock, log: (l) => lines.push(l) })).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('Nothing open')
  })

  it('refuses a missing or empty backlog with exit 2', async () => {
    expect(await runBacklogEmail(['--summary'], { env: {}, cwd: tmp() })).toBe(2)
    expect(await runBacklogEmail([], { env: FULL_ENV, cwd: docDir('# empty\n'), fetch: okFetch() })).toBe(2)
  })

  it('--dry-run writes the HTML and sends nothing, with no secrets', async () => {
    const root = docDir()
    const out = path.join(root, 'out', 'bl.html')
    const fetchMock = okFetch()
    expect(await runBacklogEmail(['--dry-run', '--out', out, '--branch', 'claude/quality-oracle'], { env: FULL_ENV, cwd: root, fetch: fetchMock })).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    const html = readFileSync(out, 'utf8')
    expect(html).toContain('Meeting notice to owners')
    expect(html).toContain('/blob/claude/quality-oracle/docs/backlog.md')
    expect(html).not.toContain('re_test_key')
    expect(html).not.toContain('owner@example.com')
  })

  it('--summary prints open and hash; without owner-actions.md nothing is "Blocked on OA"', async () => {
    const lines: string[] = []
    expect(await runBacklogEmail(['--summary'], { env: {}, cwd: docDir(), log: (l) => lines.push(l) })).toBe(0)
    expect(lines).toEqual(['open=12', `hash=${openItemsHash(parseBacklog(DOC, ['OA-9']).open)}`])
    const noOa: string[] = []
    expect(await runBacklogEmail(['--summary'], { env: {}, cwd: docDir(DOC, null), log: (l) => noOa.push(l) })).toBe(0)
    expect(noOa[1]).toBe(`hash=${openItemsHash(parseBacklog(DOC).open)}`)
    expect(noOa[1]).not.toBe(lines[1])
  })

  it('reports a Resend failure with exit 1 and no address in the message', async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ name: 'validation_error', message: 'owner@example.com is bad' }), { status: 422 }),
    )
    const lines: string[] = []
    expect(await runBacklogEmail([], { env: FULL_ENV, cwd: docDir(), fetch: fetchMock, log: (l) => lines.push(l) })).toBe(1)
    expect(lines.join('\n')).toContain('HTTP 422 (validation_error)')
    expect(lines.join('\n')).not.toContain('owner@example.com')
  })

  it('treats a Resend idempotency conflict (409) as already sent', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'invalid_idempotent_request' }), { status: 409 }))
    const lines: string[] = []
    expect(await runBacklogEmail(['--idempotency-key', 'k'], { env: FULL_ENV, cwd: docDir(), fetch: fetchMock, log: (l) => lines.push(l) })).toBe(0)
    expect(lines.join('\n')).toContain('Already sent')
  })
})
