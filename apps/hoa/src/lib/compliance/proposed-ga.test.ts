import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALL_PROPOSED_QUOTES,
  GA_PROPOSED_ADOPTION_LINE,
  GA_PROPOSED_COMMENT_DEADLINE,
  GA_PROPOSED_COMMENT_EMAIL,
  GA_PROPOSED_COMMENT_SENTENCE,
  GA_PROPOSED_FIXTURE,
  GA_PROPOSED_PARTS,
  proposedCommentOpen,
} from './proposed-ga'

/**
 * BL-160: every quote and date on the "Proposed rules (not in force)" card is
 * checked word for word against scripts/fixtures/state-law/
 * ga-sos-590-13-proposed-2026.txt, inside the rule block its citation names.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
const fixtureDir = path.join(root, 'scripts/fixtures/state-law')
const text = readFileSync(path.join(fixtureDir, GA_PROPOSED_FIXTURE), 'utf8')
const norm = (s: string) => s.replace(/\s+/g, ' ')

function block(rule: string): string {
  const start = text.indexOf(`=== Rule ${rule} |`)
  expect(start, rule).toBeGreaterThanOrEqual(0)
  const end = text.indexOf('\n=== ', start + 1)
  return norm(text.slice(start, end === -1 ? undefined : end))
}

describe('the fixture', () => {
  it('is marked proposed and not in force', () => {
    expect(text.split('\n')[0]).toContain('PROPOSED -- NOT IN FORCE')
  })

  it('carries a rule block for every rule of parts 1 to 7', () => {
    const rules = [
      '590-13-1-.01', '590-13-1-.02', '590-13-2-.01', '590-13-2-.02', '590-13-2-.03',
      '590-13-3-.01', '590-13-3-.02', '590-13-3-.03', '590-13-3-.04', '590-13-4-.01',
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `590-13-5-.0${n}`),
      ...[1, 2, 3, 4, 5, 6].map((n) => `590-13-6-.0${n}`),
      '590-13-7-.01', '590-13-7-.02',
    ]
    for (const r of rules) {
      const b = block(r)
      expect(b, r).toContain(GA_PROPOSED_ADOPTION_LINE)
      expect(b, r).toContain('Hearing: ')
    }
    expect(text.match(/^=== Rule /gm)).toHaveLength(rules.length)
  })

  it('records the sha256 of each PDF kept beside it, and they match', () => {
    const dir = path.join(fixtureDir, 'ga-sos-590-13-proposed')
    expect(existsSync(dir)).toBe(true)
    const pdfs = readdirSync(dir).filter((f) => f.endsWith('.pdf'))
    expect(pdfs).toHaveLength(8)
    for (const f of pdfs) {
      const sha = createHash('sha256').update(readFileSync(path.join(dir, f))).digest('hex')
      expect(text, f).toContain(`${f}\n#        sha256 ${sha}`)
    }
  })
})

describe('every quote on the card is word for word in its rule', () => {
  for (const q of ALL_PROPOSED_QUOTES) {
    it(`${q.cite}: “${q.quote.slice(0, 40)}…”`, () => {
      expect(block(q.rule)).toContain(norm(q.quote))
      expect(q.cite).toContain(q.rule.replace('590-13-', '590-13-'))
    })
  }

  it('no quote is listed twice', () => {
    expect(new Set(ALL_PROPOSED_QUOTES.map((q) => q.quote)).size).toBe(ALL_PROPOSED_QUOTES.length)
  })

  it('every part has a summary and at least one quote, and no summary contains a quotation mark', () => {
    expect(GA_PROPOSED_PARTS.map((p) => p.id)).toEqual(['590-13-1', '590-13-2', '590-13-3', '590-13-4', '590-13-5', '590-13-6', '590-13-7'])
    for (const p of GA_PROPOSED_PARTS) {
      expect(p.summary.length).toBeGreaterThan(40)
      expect(p.summary).not.toMatch(/["“”]/)
      expect(p.quotes.length).toBeGreaterThan(0)
    }
  })

  it('summaries and quote citations use no em dashes', () => {
    for (const p of GA_PROPOSED_PARTS) {
      expect(p.summary + p.title + p.quotes.map((q) => q.cite).join('')).not.toContain('—')
    }
  })
})

describe('dates match the notices', () => {
  it('the comment deadline is the notices’ sentence and Monday, 2026-11-02', () => {
    expect(text).toContain(`=== Notices | Deadline for Submission of Comments\n${GA_PROPOSED_COMMENT_SENTENCE}`)
    expect(GA_PROPOSED_COMMENT_SENTENCE).toContain('Monday, November 2, 2026')
    expect(new Date(`${GA_PROPOSED_COMMENT_DEADLINE}T12:00:00Z`).getUTCDay()).toBe(1)
    expect(text).toContain(GA_PROPOSED_COMMENT_EMAIL)
  })

  it('each hearing time is on the Hearing line of every rule it names', () => {
    for (const p of GA_PROPOSED_PARTS) {
      expect(p.hearings.length).toBeGreaterThan(0)
      for (const h of p.hearings) {
        const rules = h.rules.flatMap((r) => {
          const m = /^(590-13-(\d)-\.(\d+)) to \.(\d+)$/.exec(r)
          if (!m) return [r]
          const out: string[] = []
          for (let n = Number(m[3]); n <= Number(m[4]); n++) out.push(`590-13-${m[2]}-.${String(n).padStart(2, '0')}`)
          return out
        })
        for (const r of rules) expect(block(r), r).toContain(`Hearing: ${h.when}`)
      }
    }
  })

  it('hearings fall on November 4 and 5, 2026', () => {
    for (const p of GA_PROPOSED_PARTS) for (const h of p.hearings) expect(h.when).toMatch(/November [45], 2026$/)
  })

  it('the comment line is shown through the deadline day and hidden after', () => {
    expect(proposedCommentOpen('2026-10-30')).toBe(true)
    expect(proposedCommentOpen('2026-11-02')).toBe(true)
    expect(proposedCommentOpen('2026-11-03')).toBe(false)
  })
})
