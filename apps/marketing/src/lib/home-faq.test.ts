import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { HOME_FAQS } from './home-faq'
import { faqLd } from './jsonld'
import { HOA_PRICE_COPY } from './hoa-pricing'

const read = (rel: string) => readFileSync(path.join(__dirname, '..', rel), 'utf8')

describe('homepage FAQ', () => {
  it('has 6 to 8 questions with unique text', () => {
    expect(HOME_FAQS.length).toBeGreaterThanOrEqual(6)
    expect(HOME_FAQS.length).toBeLessThanOrEqual(8)
    expect(new Set(HOME_FAQS.map((f) => f.q)).size).toBe(HOME_FAQS.length)
  })

  it('structured data carries exactly the visible questions and answers', () => {
    const ld = faqLd(HOME_FAQS) as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
    expect(ld.mainEntity.map((e) => [e.name, e.acceptedAnswer.text])).toEqual(HOME_FAQS.map((f) => [f.q, f.a]))
  })

  it('the section renders the same list it serializes', () => {
    const src = read('components/site/home-faq.tsx')
    expect(src).toContain('faqLd(HOME_FAQS)')
    expect(src).toContain('items={HOME_FAQS}')
  })

  it('price and contract come from the pricing constants, not hardcoded', () => {
    const cost = HOME_FAQS.find((f) => /cost/i.test(f.q))!
    expect(cost.a).toContain(HOA_PRICE_COPY.summary)
    expect(read('lib/home-faq.ts')).not.toMatch(/\$\d/)
  })

  it('has no em dashes', () => {
    for (const f of HOME_FAQS) expect(f.q + f.a).not.toContain('—')
  })
})
