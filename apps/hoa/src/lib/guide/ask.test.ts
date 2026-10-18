import { describe, expect, it, vi } from 'vitest'
import { askGuide, type AskComplete } from './ask'

// The model is always a mock here: no test reaches a provider.

const answering: AskComplete = async () =>
  JSON.stringify({ answer: '1. Open Dues. [S1]\n2. Select [[Mark paid]]. [S1]', citations: ['S1'], route: 'S1', covered: true })

describe('askGuide', () => {
  it('answers a covered how-to from the sources, with citations and a deep link', async () => {
    const r = await askGuide('How do I record a check payment?', { role: 'admin' }, answering)
    expect(r.kind).toBe('answer')
    if (r.kind !== 'answer') return
    expect(r.citations[0]!.articleId).toBe('dues-record-payment')
    expect(r.takeMeThere?.href).toBe('/dues')
    expect(r.meta.modelCalled).toBe(true)
  })

  it('routes a rules question to Ask the Docs without retrieval or a model call', async () => {
    const complete = vi.fn(answering)
    const board = await askGuide('Can I paint my front door red?', { role: 'board' }, complete)
    const resident = await askGuide('Can I paint my front door red?', { role: 'resident' }, complete)
    expect(board).toMatchObject({ kind: 'rules_question', askDocsHref: '/ai/ask' })
    expect(resident).toMatchObject({ kind: 'rules_question', askDocsHref: '/resident/ask' })
    expect(complete).not.toHaveBeenCalled()
  })

  it('refuses a question the guide does not cover BEFORE calling the model', async () => {
    const complete = vi.fn(answering)
    const r = await askGuide('Can residents book the clubhouse for a party?', { role: 'admin' }, complete)
    expect(r.kind).toBe('not_covered')
    expect(complete).not.toHaveBeenCalled()
    expect(r.meta.modelCalled).toBe(false)
  })

  it('redacts email and phone from the question before the model sees it', async () => {
    const complete = vi.fn(answering)
    await askGuide('How do I record a check payment from jane.doe@example.test, call 305-555-0142?', { role: 'admin' }, complete)
    const sent = JSON.stringify(complete.mock.calls[0]![0])
    expect(sent).not.toContain('jane.doe@example.test')
    expect(sent).not.toContain('305-555-0142')
    expect(sent).toContain('[email removed]')
    expect(sent).toContain('[phone removed]')
  })

  it('returns the matching articles when the model is unavailable', async () => {
    const r = await askGuide('How do I record a check payment?', { role: 'admin' }, async () => {
      throw new Error('ai_http_503')
    })
    expect(r.kind).toBe('unavailable')
    if (r.kind !== 'unavailable') return
    expect(r.suggestions[0]!.articleId).toBe('dues-record-payment')
  })

  it('treats an unparseable reply as unavailable, and an uncited one as not covered', async () => {
    const garbled = await askGuide('How do I record a check payment?', { role: 'admin' }, async () => 'Sure! Just click around.')
    expect(garbled.kind).toBe('unavailable')
    const uncited = await askGuide('How do I record a check payment?', { role: 'admin' }, async () =>
      JSON.stringify({ answer: 'Go to https://evil.example', citations: ['S42'], route: null, covered: true }),
    )
    expect(uncited.kind).toBe('not_covered')
    expect(JSON.stringify(uncited)).not.toContain('evil.example')
  })

  it('a model that says covered:false yields not_covered with suggestions', async () => {
    const r = await askGuide('How do I record a check payment?', { role: 'admin' }, async () =>
      JSON.stringify({ answer: '', citations: [], route: null, covered: false }),
    )
    expect(r.kind).toBe('not_covered')
    if (r.kind === 'not_covered') expect(r.suggestions.length).toBeGreaterThan(0)
  })
})
