import { describe, expect, it } from 'vitest'
import { build } from '../../../../../scripts/chat-corpus-build'
import { retrieve } from './corpus'
import { HELP_ARTICLES } from './help-articles.generated'
import { NOT_FOUND_TOKEN, SYSTEM_PROMPT, buildMessages, parseAnswer } from './prompt'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const top = (q: string, n = 3) => retrieve(q, n).map((h) => h.passage.url)
const ids = (q: string, n = 3) => retrieve(q, n).map((h) => h.passage.id)

describe('retrieval for the suggested questions', () => {
  it('cost -> the pricing page', () => {
    expect(top('How much does it cost?', 2)).toContain('/pricing')
    expect(retrieve('How much does it cost?', 1)[0]!.passage.url).toBe('/pricing')
  })

  it('import the owner list -> the import help article or pricing import answer', () => {
    const got = ids('Can I import my owner list?', 3)
    expect(got.some((i) => i === 'help:setup-import-roster' || i === 'fact:import')).toBe(true)
  })

  it("Georgia's new rules -> a Georgia page", () => {
    const got = top("How do Georgia's new HOA rules affect us?", 3)
    expect(got.some((u) => u.startsWith('/georgia') || u.startsWith('/guides/georgia'))).toBe(true)
  })

  it("can't sign in -> the sign-in help", () => {
    expect(ids("I can't sign in", 2)).toContain('fact:sign-in')
  })

  it.each(["I can't sign in", "can't log in", 'forgot password', 'reset my password'])('%s -> a sign-in help answer in the top 2', (q) => {
    expect(ids(q, 2).some((i) => i === 'fact:sign-in' || /^help:.*(sign|password|login)/.test(i))).toBe(true)
  })

  it('gibberish finds nothing', () => {
    expect(retrieve('zxqv blorptastic', 3)).toEqual([])
  })
})

describe('the help-article extract', () => {
  it('is current with apps/hoa/src/generated/guide.ts', () => {
    const { text, count } = build()
    expect(count).toBe(HELP_ARTICLES.length)
    const file = readFileSync(join(__dirname, 'help-articles.generated.ts'), 'utf8')
    expect(file).toBe(text)
  })
})

describe('system prompt', () => {
  it('requires answering only from the sources', () => {
    expect(SYSTEM_PROMPT).toMatch(/Answer only from the numbered SOURCES/)
    expect(SYSTEM_PROMPT).toContain(NOT_FOUND_TOKEN)
  })
  it('forbids legal advice and points to an attorney', () => {
    expect(SYSTEM_PROMPT).toMatch(/Never give legal advice/)
    expect(SYSTEM_PROMPT).toMatch(/attorney/)
  })
  it('forbids invented prices and says online payments are coming soon', () => {
    expect(SYSTEM_PROMPT).toMatch(/Never invent prices/)
    expect(SYSTEM_PROMPT).toMatch(/coming soon/)
  })
  it('has no em dash and names the escalation', () => {
    expect(SYSTEM_PROMPT).not.toContain('—')
    expect(SYSTEM_PROMPT).toContain('Talk to a person')
  })
  it('puts the sources in the system message, then the history', () => {
    const hits = retrieve('How much does it cost?', 2)
    const msgs = buildMessages([{ role: 'user', content: 'How much does it cost?' }], hits)
    expect(msgs[0]!.role).toBe('system')
    expect(msgs[0]!.content).toContain('[1]')
    expect(msgs[1]).toEqual({ role: 'user', content: 'How much does it cost?' })
  })
})

describe('parseAnswer', () => {
  it('splits the SOURCES line and cleans em dashes', () => {
    expect(parseAnswer('It is $10 — per month.\nSOURCES: 2, 1')).toEqual({
      answer: 'It is $10, per month.',
      notFound: false,
      used: [2, 1],
    })
  })
  it('treats the token as not found', () => {
    expect(parseAnswer(NOT_FOUND_TOKEN).notFound).toBe(true)
    expect(parseAnswer('   ').notFound).toBe(true)
  })
})
