import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildEmail, notesAddedInRange, toPayload } from './lib/build'
import { renderEmail } from './lib/email'
import { formatDeployedAt, noteFromCommits, parseSubject, toNewYorkIso } from './lib/fallback'
import { MAX_SCREENSHOTS, prepareImages, type ImageProcessor, type InlineImage } from './lib/images'
import { inline } from './lib/markdown'
import { combineNotes, parseNote, selectNotes } from './lib/note'
import { runSend } from './lib/run'
import { readSendEnv } from './lib/send'

const DEPLOYED = 'c56061f8aa88192a885522f4af1eda89c020932a'

const NOTE = `---
title: One-click approvals & search
deployed_at: 2026-10-17T15:55:00-04:00
---

## Summary

Boards can approve letters from **Approvals**. Search finds records.

## What's new

### Approvals
- Approve or reject violation letters
- Bills read by AI wait for approval

### Search
- ⌘K finds owners and units

## Fixes

- CSV exports are guarded against formulas

## Under the hood

- Route conventions round 4

## Needs your action

- Try a real bill scan

## Screenshots

![Approvals queue](assets/x/approvals.png)
![Search](assets/x/search.png)
`

const tmpDirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'rn-test-'))
  tmpDirs.push(d)
  return d
}
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Fake processor: no sharp, deterministic bytes. */
const fakeProcessor: ImageProcessor = async (input) => ({
  content: Buffer.from(`jpeg:${input.length}`),
  contentType: 'image/jpeg',
  width: 1200,
  height: 750,
})

function fakeImages(n: number): InlineImage[] {
  return Array.from({ length: n }, (_, i) => ({
    cid: `shot${i + 1}.x@release-notes`,
    filename: `0${i + 1}-x.jpg`,
    contentType: 'image/jpeg',
    content: Buffer.from('x'),
    alt: `Shot ${i + 1}`,
    width: 1200,
    height: 750,
  }))
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 't',
      GIT_AUTHOR_EMAIL: 't@example.com',
      GIT_COMMITTER_NAME: 't',
      GIT_COMMITTER_EMAIL: 't@example.com',
    },
  }).trim()
}

/** A throwaway repo: base commit, then commits with the given files/subjects. */
function repo(commits: { subject: string; files?: Record<string, string> }[]): { root: string; shas: string[] } {
  const root = tmp()
  git(root, 'init', '-q', '-b', 'main')
  writeFileSync(path.join(root, 'README'), 'base\n')
  git(root, 'add', '.')
  git(root, 'commit', '-q', '-m', 'chore: base')
  const shas = [git(root, 'rev-parse', 'HEAD')]
  for (const [i, c] of commits.entries()) {
    for (const [f, body] of Object.entries(c.files ?? { [`f${i}.txt`]: String(i) })) {
      mkdirSync(path.dirname(path.join(root, f)), { recursive: true })
      writeFileSync(path.join(root, f), body)
    }
    git(root, 'add', '.')
    git(root, 'commit', '-q', '-m', c.subject)
    shas.push(git(root, 'rev-parse', 'HEAD'))
  }
  return { root, shas }
}

describe('render', () => {
  const note = combineNotes([parseNote(NOTE, '/repo/docs/releases/2026-10-17-1555-x.md')], { sha: DEPLOYED })

  it('produces a complete, table-based HTML document with title, time and sections', () => {
    const { html, subject, text } = renderEmail(note, fakeImages(2))
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true)
    expect(html).toContain('</html>')
    expect(html).toContain('role="presentation"')
    expect(html).toContain('One-click approvals &amp; search')
    expect(subject).toBe('Ledger release: One-click approvals & search (c56061f)')
    expect(html).toContain('Saturday, October 17, 2026 at 3:55 PM EDT')
    for (const h of ['Summary', "What&#39;s new", 'Fixes', 'Under the hood', 'Needs your action', 'Screenshots']) {
      expect(html).toContain(`>${h}<`)
    }
    expect(html).toContain('>Approvals</h3>')
    expect(html).toContain('<strong>Approvals</strong>')
    expect(html).toMatch(/<li[^>]*>Approve or reject violation letters<\/li>/)
    expect(text).toContain('WHAT\'S NEW')
    expect(text).toContain('  - Try a real bill scan')
  })

  it('references every inline image by CID and nothing remote', () => {
    const images = fakeImages(2)
    const { html } = renderEmail(note, images)
    for (const img of images) expect(html).toContain(`src="cid:${img.cid}"`)
    expect(html).not.toMatch(/<img[^>]+src="https?:/)
  })

  it('footer links the DEPLOYED sha to its GitHub commit', () => {
    const { html } = renderEmail(note, [])
    expect(html).toContain(`https://github.com/asafhamo55-coder/HomeOwnerHub/commit/${DEPLOYED}`)
    expect(html).toContain('https://www.homeownerledger.com')
    expect(html).toContain('>c56061f</a>')
  })

  it('escapes markup and refuses non-http links', () => {
    expect(inline('<script>alert(1)</script>')).not.toContain('<script>')
    expect(inline('[x](javascript:alert(1))')).not.toContain('href=')
    expect(inline('[docs](https://example.com/?a=1&b=2)')).toContain('href="https://example.com/?a=1&amp;b=2"')
  })

  it('formats deploy times in America/New_York', () => {
    expect(formatDeployedAt('2026-10-17T19:55:00Z')).toBe('Saturday, October 17, 2026 at 3:55 PM EDT')
    expect(toNewYorkIso(new Date('2026-10-17T19:55:00Z'))).toBe('2026-10-17T15:55:00-04:00')
    expect(toNewYorkIso(new Date('2026-12-01T17:00:00Z'))).toBe('2026-12-01T12:00:00-05:00')
  })
})

describe('screenshots', () => {
  it('resizes to ≤1200px JPEG with sharp and caps the count at 6', async () => {
    const sharp = (await import('sharp')).default
    const dir = tmp()
    const png = await sharp({ create: { width: 2000, height: 1000, channels: 4, background: '#4F46E5' } })
      .png()
      .toBuffer()
    const shots = Array.from({ length: 8 }, (_, i) => {
      const file = path.join(dir, `s${i}.png`)
      writeFileSync(file, png)
      return { alt: `S${i}`, file }
    })
    const out = await prepareImages(shots)
    expect(out).toHaveLength(MAX_SCREENSHOTS)
    expect(out[0]!.contentType).toBe('image/jpeg')
    expect(out[0]!.width).toBe(1200)
    const meta = await sharp(out[0]!.content).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.width).toBe(1200)
    expect(new Set(out.map((o) => o.cid)).size).toBe(MAX_SCREENSHOTS)
  })
})

describe('note selection', () => {
  function writeNotes(dir: string, files: Record<string, string>): void {
    mkdirSync(dir, { recursive: true })
    for (const [f, body] of Object.entries(files)) writeFileSync(path.join(dir, f), body)
  }

  it('frontmatter sha and deployed_at are optional', () => {
    const n = parseNote('---\ntitle: Hello\n---\n## Summary\n\nHi.\n', '/x/2026-10-17-1555-a.md')
    expect(n.sha).toBeNull()
    expect(n.deployedAt).toBeNull()
    const combined = combineNotes([n], { sha: DEPLOYED, deployedAt: '2026-10-17T15:55:00-04:00' })
    expect(combined.sha).toBe(DEPLOYED)
  })

  it('a nested whats_new block (BL-070) never overrides the top-level title or sha', () => {
    const n = parseNote(
      '---\ntitle: Real headline\nwhats_new:\n  - body: Short body.\n    title: Entry title\n    sha: deadbeefdeadbeef\n    roles: [admin, board]\n    label: new\n---\n## Summary\n\nHi.\n',
      '/x/2026-10-17-1555-a.md',
    )
    expect(n.title).toBe('Real headline')
    expect(n.sha).toBeNull()
  })

  it('combines several notes added in the range, in filename order, under the deployed sha', () => {
    const dir = tmp()
    writeNotes(dir, {
      '2026-10-17-1500-b.md': '---\ntitle: Second\nsha: 1111111\n---\n## Fixes\n\n- Fix B\n',
      '2026-10-17-1400-a.md': '---\ntitle: First\n---\n## Summary\n\nA.\n\n## Fixes\n\n- Fix A\n',
      'README.md': '# not a note',
      '_template.md': '---\ntitle: T\n---\n',
    })
    const added = ['2026-10-17-1500-b.md', '2026-10-17-1400-a.md', 'README.md'].map((f) => path.join(dir, f))
    const notes = selectNotes(dir, DEPLOYED, added)
    expect(notes.map((n) => n.title)).toEqual(['First', 'Second'])
    const c = combineNotes(notes, { sha: DEPLOYED, deployedAt: '2026-10-17T15:55:00-04:00' })
    expect(c.title).toBe('First · Second')
    expect(c.sha).toBe(DEPLOYED) // not the note's informational 1111111
    expect(c.sections.Fixes).toBe('- Fix A\n\n- Fix B')
  })

  it('falls back to a late note whose sha matches, when none was added in range', () => {
    const dir = tmp()
    writeNotes(dir, {
      '2026-10-17-1555-late.md': '---\ntitle: Late\nsha: c56061f\n---\n## Summary\n\nLate.\n',
      '2026-10-10-1000-other.md': '---\ntitle: Other\nsha: deadbee\n---\n',
    })
    expect(selectNotes(dir, DEPLOYED, []).map((n) => n.title)).toEqual(['Late'])
    expect(selectNotes(dir, 'abcdef0123456', [])).toEqual([])
  })

  it('finds notes added in prev..sha with git diff --diff-filter=A', () => {
    const noteBody = '---\ntitle: In range\n---\n## Summary\n\nYes.\n'
    const { root, shas } = repo([
      { subject: 'docs: old note', files: { 'docs/releases/2026-10-01-1000-old.md': noteBody } },
      { subject: 'feat(x): thing', files: { 'docs/releases/2026-10-17-1555-new.md': noteBody, 'a.txt': '1' } },
      { subject: 'fix(y): edit old note', files: { 'docs/releases/2026-10-01-1000-old.md': noteBody + '\nmore\n' } },
    ])
    const added = notesAddedInRange(root, shas[1]!, shas[3]!)
    expect(added).toEqual([path.join(root, 'docs/releases/2026-10-17-1555-new.md')])
  })
})

describe('fallback from commit subjects', () => {
  it('groups conventional-commit prefixes into sections', () => {
    const note = noteFromCommits(
      [
        { sha: 'a', subject: 'feat(search): ⌘K finds records' },
        { sha: 'b', subject: 'feat(search): documents are searchable' },
        { sha: 'c', subject: 'feat: association setup' },
        { sha: 'd', subject: 'fix(dues): reminder day per association' },
        { sha: 'e', subject: 'docs: cycle log' },
        { sha: 'f', subject: 'test: readPrimaryAssociation expects timeZone' },
        { sha: 'g', subject: "Merge commit 'abc' into main" },
        { sha: 'h', subject: 'Random subject' },
      ],
      { sha: DEPLOYED, deployedAt: '2026-10-17T15:55:00-04:00', previousSha: 'bb1418eb1d1d' },
    )
    expect(note.source).toBe('commits')
    expect(note.screenshots).toEqual([])
    expect(note.title).toBe('7 changes shipped')
    expect(note.sections["What's new"]).toBe(
      '### Search\n- ⌘K finds records\n- Documents are searchable\n\n### General\n- Association setup',
    )
    expect(note.sections.Fixes).toBe('- Reminder day per association (dues)')
    expect(note.sections['Under the hood']).toBe('- 1 documentation update\n- 1 test change\n- 1 other change')
    expect(note.sections.Summary).toContain('since bb1418e')
  })

  it('parses breaking-change and scope-less subjects', () => {
    expect(parseSubject('feat(api)!: drop v1')).toEqual({ type: 'feat', scope: 'api', text: 'drop v1' })
    expect(parseSubject('just words')).toEqual({ type: null, scope: null, text: 'just words' })
  })

  it('buildEmail uses commit subjects when no note was added, with no screenshots', async () => {
    const { root, shas } = repo([{ subject: 'feat(search): records' }, { subject: 'fix(csv): formula guard' }])
    const built = await buildEmail({ root, sha: shas[2]!, previousSha: shas[0]!, imageProcessor: fakeProcessor })
    expect(built.note.source).toBe('commits')
    expect(built.images).toEqual([])
    expect(built.html).toContain('Records')
    expect(built.html).toContain('Formula guard (csv)')
  })
})

describe('send', () => {
  const FULL_ENV = {
    RESEND_API_KEY: 're_test_key',
    RELEASE_NOTES_TO: 'owner@example.com, second@example.com',
    RELEASE_NOTES_FROM: 'Ledger releases <noreply@example.com>',
  }

  function okFetch() {
    return vi.fn(async () => new Response(JSON.stringify({ id: 'email_123' }), { status: 200 }))
  }

  /** A repo whose deployed commit adds a note that tries to name its own recipients. */
  function repoWithHostileNote() {
    const body = `---\ntitle: Hostile\nto: attacker@evil.example\nrecipients: attacker@evil.example\n---\n## Summary\n\nHi.\n`
    return repo([{ subject: 'feat: x', files: { 'docs/releases/2026-10-17-1555-hostile.md': body } }])
  }

  it.each([
    ['RESEND_API_KEY'],
    ['RELEASE_NOTES_TO'],
    ['RELEASE_NOTES_FROM'],
  ])('refuses with exit 2 and sends nothing when %s is missing', async (missing) => {
    const env: Record<string, string> = { ...FULL_ENV }
    delete env[missing]
    const fetchMock = okFetch()
    const lines: string[] = []
    const code = await runSend(['--sha', 'HEAD'], { env, cwd: tmp(), fetch: fetchMock, log: (l) => lines.push(l) })
    expect(code).toBe(2)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain(missing)
  })

  it('falls back to EMAIL_FROM for the sender', () => {
    const { RELEASE_NOTES_FROM: _omit, ...rest } = FULL_ENV
    expect(readSendEnv({ ...rest, EMAIL_FROM: 'HomeownerHub <noreply@example.com>' }).from).toBe(
      'HomeownerHub <noreply@example.com>',
    )
  })

  it('takes recipients only from RELEASE_NOTES_TO, never from the note or payload', async () => {
    const { root, shas } = repoWithHostileNote()
    const fetchMock = okFetch()
    const code = await runSend(['--sha', shas[1]!, '--prev', shas[0]!], {
      env: FULL_ENV,
      cwd: root,
      fetch: fetchMock,
      imageProcessor: fakeProcessor,
    })
    expect(code).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.resend.com/emails')
    const body = JSON.parse(String(init.body)) as Record<string, unknown>
    expect(body.to).toEqual(['owner@example.com', 'second@example.com'])
    expect(body.from).toBe('Ledger releases <noreply@example.com>')
    expect(JSON.stringify(body)).not.toContain('attacker@evil.example')
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(`release-notes-${shas[1]}`)

    // A payload file carrying recipients is stripped to content fields.
    const built = await buildEmail({ root, sha: shas[1]!, previousSha: shas[0]!, imageProcessor: fakeProcessor })
    const payloadFile = path.join(root, 'payload.json')
    writeFileSync(payloadFile, JSON.stringify({ ...toPayload(built), to: ['attacker@evil.example'], bcc: 'attacker@evil.example' }))
    const fetch2 = okFetch()
    expect(await runSend(['--payload', payloadFile], { env: FULL_ENV, cwd: root, fetch: fetch2 })).toBe(0)
    const body2 = JSON.parse(String((fetch2.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as Record<string, unknown>
    expect(body2.to).toEqual(['owner@example.com', 'second@example.com'])
    expect(body2.bcc).toBeUndefined()
    expect(JSON.stringify(body2)).not.toContain('attacker@evil.example')
  })

  it('refuses recipient flags outright', async () => {
    const fetchMock = okFetch()
    for (const flag of ['--to', '--cc', '--bcc', '--from']) {
      expect(await runSend([flag, 'x@example.com'], { env: FULL_ENV, cwd: tmp(), fetch: fetchMock })).toBe(2)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('--dry-run writes the HTML and sends nothing, even with every secret set', async () => {
    const { root, shas } = repoWithHostileNote()
    const fetchMock = okFetch()
    const out = path.join(root, 'out', 'preview.html')
    const code = await runSend(['--sha', shas[1]!, '--prev', shas[0]!, '--dry-run', '--out', out], {
      env: FULL_ENV,
      cwd: root,
      fetch: fetchMock,
      imageProcessor: fakeProcessor,
    })
    expect(code).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(existsSync(out)).toBe(true)
    expect(readFileSync(out, 'utf8')).toContain('Hostile')
  })

  it('--dry-run needs no secrets', async () => {
    const { root, shas } = repo([{ subject: 'fix: a' }])
    const out = path.join(root, 'p.html')
    expect(await runSend(['--sha', shas[1]!, '--dry-run', '--out', out], { env: {}, cwd: root, fetch: okFetch() })).toBe(0)
    expect(existsSync(out)).toBe(true)
  })

  it('reports a Resend failure with exit 1 and no address in the message', async () => {
    const { root, shas } = repo([{ subject: 'fix: a' }])
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ name: 'validation_error', message: 'owner@example.com is bad' }), { status: 422 }),
    )
    const lines: string[] = []
    const code = await runSend(['--sha', shas[1]!], { env: FULL_ENV, cwd: root, fetch: fetchMock, log: (l) => lines.push(l) })
    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('HTTP 422 (validation_error)')
    expect(lines.join('\n')).not.toContain('owner@example.com')
  })
})
