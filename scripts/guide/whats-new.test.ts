import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUIDE_ARTICLES } from '../../apps/hoa/src/generated/guide'
import { parseReleaseNote } from '../../apps/hoa/src/lib/release-notes'
import { compileWhatsNew, isReleaseNoteFile } from './whats-new'
import { RELEASES_DIR } from './paths'

const IDS = new Set(['dues-record-payment', 'approvals-queue'])

const note = (whatsNew: string, title = 'A release') => `---\ntitle: ${title}\n${whatsNew}---\n\n## Summary\n\nThings changed.\n`

const ENTRY = `whats_new:
  - title: Edit a scanned bill before you approve it
    body: Fix the vendor, amount or due date the AI read from a bill, right in Approvals.
    roles: [admin, board]
    article: approvals-queue
    label: improvement
`

describe('compileWhatsNew', () => {
  it('a note without whats_new contributes nothing (the default)', () => {
    expect(compileWhatsNew([{ file: 'docs/releases/2026-10-01-1000-x.md', src: note('') }], IDS)).toEqual({ entries: [], errors: [] })
  })

  it('collects entries with a stable id, the note date and the guide article', () => {
    const { entries, errors } = compileWhatsNew([{ file: 'docs/releases/2026-10-17-1700-bills.md', src: note(ENTRY) }], IDS)
    expect(errors).toEqual([])
    expect(entries).toEqual([
      {
        id: '2026-10-17-1700-bills#1',
        note: '2026-10-17-1700-bills',
        date: '2026-10-17',
        title: 'Edit a scanned bill before you approve it',
        body: 'Fix the vendor, amount or due date the AI read from a bill, right in Approvals.',
        roles: ['admin', 'board'],
        article: 'approvals-queue',
        label: 'improvement',
      },
    ])
  })

  it('sorts newest note first, entries in written order', () => {
    const two = `whats_new:\n  - { title: First, body: One., roles: [admin], label: new }\n  - { title: Second, body: Two., roles: [admin], label: fix }\n`
    const { entries } = compileWhatsNew(
      [
        { file: 'docs/releases/2026-10-01-1000-old.md', src: note(two) },
        { file: 'docs/releases/2026-10-17-1000-new.md', src: note(two) },
      ],
      IDS,
    )
    expect(entries.map((e) => e.id)).toEqual(['2026-10-17-1000-new#1', '2026-10-17-1000-new#2', '2026-10-01-1000-old#1', '2026-10-01-1000-old#2'])
  })

  it('refuses an unknown article, a long body, a link, a bad label and unknown keys', () => {
    const bad = `whats_new:
  - { title: A, body: B., roles: [admin], label: new, article: no-such-article }
  - { title: A, body: "${'x'.repeat(281)}", roles: [admin], label: new }
  - { title: A, body: "See https://evil.example", roles: [admin], label: new }
  - { title: A, body: B., roles: [admin], label: shiny }
  - { title: A, body: B., roles: [admin], label: new, url: x }
  - { title: A, body: B., label: new }
`
    const { entries, errors } = compileWhatsNew([{ file: 'docs/releases/2026-10-17-1000-bad.md', src: note(bad) }], IDS)
    expect(entries).toEqual([])
    expect(errors).toHaveLength(6)
    expect(errors.join('\n')).toMatch(/unknown guide article "no-such-article"/)
  })

  it('reports invalid YAML instead of silently dropping the block', () => {
    const { errors } = compileWhatsNew([{ file: 'docs/releases/2026-10-17-1000-y.md', src: note(ENTRY, 'Bills: now editable') }], IDS)
    expect(errors[0]).toMatch(/not valid YAML/)
  })

  it('only YYYY-MM-DD-… notes count; the template and README do not', () => {
    expect(isReleaseNoteFile('2026-10-17-2100-user-guide.md')).toBe(true)
    expect(isReleaseNoteFile('_template.md')).toBe(false)
    expect(isReleaseNoteFile('README.md')).toBe(false)
  })

  it('a whats_new block leaves /whats-new title and summary parsing alone', () => {
    const n = parseReleaseNote('2026-10-17-1700-bills.md', note(ENTRY, 'Bills'))!
    expect(n.title).toBe('Bills')
    expect(n.summary).toEqual([{ type: 'p', text: 'Things changed.' }])
  })
})

describe('the committed release notes', () => {
  it('every whats_new block in docs/releases compiles', () => {
    const files = readdirSync(RELEASES_DIR).filter(isReleaseNoteFile)
    const { errors } = compileWhatsNew(
      files.map((f) => ({ file: f, src: readFileSync(resolve(RELEASES_DIR, f), 'utf8') })),
      new Set(GUIDE_ARTICLES.map((a) => a.id)),
    )
    expect(errors).toEqual([])
  })
})
