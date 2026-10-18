import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import YAML from 'yaml'
import { describe, expect, it } from 'vitest'
import { GUIDE_ARTICLES } from '../../apps/hoa/src/generated/guide'
import { EvalSetSchema, evaluateQuestion, evaluateSet, unknownArticleIds } from './eval'
import { CONTENT_DIR } from './paths'

describe('guide eval scoring', () => {
  it('a how-to passes only when its article is in the top 3 and the gate lets it through', () => {
    expect(evaluateQuestion({ id: 'x', q: 'How do I record a check payment?', role: 'admin', expect: 'dues-record-payment' }).pass).toBe(true)
    const wrong = evaluateQuestion({ id: 'y', q: 'How do I record a check payment?', role: 'admin', expect: 'meetings-schedule-and-minutes' })
    expect(wrong.pass).toBe(false)
    expect(wrong.reason).toMatch(/top 3/)
  })

  it('a canary passes only when the gate refuses it; a rules question only when routed', () => {
    expect(evaluateQuestion({ id: 'c', q: 'How do I sync our books with QuickBooks?', role: 'admin', expect: 'refuse' }).pass).toBe(true)
    expect(evaluateQuestion({ id: 'c2', q: 'How do I record a check payment?', role: 'admin', expect: 'refuse' }).pass).toBe(false)
    expect(evaluateQuestion({ id: 'd', q: 'Can I paint my front door red?', role: 'resident', expect: 'rules' }).pass).toBe(true)
    expect(evaluateQuestion({ id: 'd2', q: 'How do I pay my dues?', role: 'resident', expect: 'rules' }).pass).toBe(false)
  })

  it('flags an eval entry naming an article that does not exist', () => {
    expect(unknownArticleIds([{ id: 'z', q: 'abc', role: 'admin', expect: 'nope' }], new Set(['a']))).toEqual(['z:nope'])
  })
})

describe('the committed eval set', () => {
  const set = EvalSetSchema.parse(YAML.parse(readFileSync(resolve(CONTENT_DIR, '_eval', 'questions.yaml'), 'utf8')))

  it('has about 40 questions, 10 canaries and 5 rules questions, all naming real articles', () => {
    expect(set.questions.length).toBeGreaterThanOrEqual(40)
    expect(set.questions.filter((q) => q.expect === 'refuse').length).toBeGreaterThanOrEqual(10)
    expect(set.questions.filter((q) => q.expect === 'rules').length).toBeGreaterThanOrEqual(5)
    expect(new Set(set.questions.map((q) => q.id)).size).toBe(set.questions.length)
    expect(unknownArticleIds(set.questions, new Set(GUIDE_ARTICLES.map((a) => a.id)))).toEqual([])
  })

  it('meets the spec §11 bars in retrieval mode', () => {
    const r = evaluateSet(set.questions)
    expect(r.hitAt3).toBeGreaterThanOrEqual(0.9)
    expect(r.refusal).toBeGreaterThanOrEqual(0.9)
    expect(r.rulesRouted).toBeGreaterThanOrEqual(0.8)
  })
})
