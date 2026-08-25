import { describe, it, expect, afterEach } from 'vitest'
import { DEFAULT_MODEL, DECOMMISSIONED_MODELS, resolveModel } from './model'

/**
 * Regression guard for the 2026-08-16 outage: Groq decommissioned
 * `llama-3.3-70b-versatile`, which every workflow carried as its own
 * hardcoded default. Each AI feature — inbox reply drafting most visibly —
 * started 404ing in under 300ms with "Could not draft a reply right now."
 *
 * Two distinct defects are pinned here:
 *   1. the default model id must be one the provider still serves, and
 *   2. an EMPTY AI_MODEL must fall through to that default rather than
 *      resolving to '' (`??` only guards undefined). An empty AI_MODEL
 *      previously sent a model-less request to api.openai.com — see the
 *      401 in ai_runs on 2026-08-02, and empty-env.test.ts for the same
 *      class of bug in the embedding and vision clients.
 */
describe('DEFAULT_MODEL', () => {
  it('is not a model the provider has decommissioned', () => {
    expect(DECOMMISSIONED_MODELS.has(DEFAULT_MODEL)).toBe(false)
  })

  it('still lists the model that caused the outage as decommissioned', () => {
    expect(DECOMMISSIONED_MODELS.has('llama-3.3-70b-versatile')).toBe(true)
  })
})

describe('resolveModel', () => {
  const saved = process.env.AI_MODEL
  afterEach(() => {
    if (saved === undefined) delete process.env.AI_MODEL
    else process.env.AI_MODEL = saved
  })

  it('uses AI_MODEL when it is set to a real value', () => {
    process.env.AI_MODEL = 'some/other-model'
    expect(resolveModel()).toBe('some/other-model')
  })

  it('falls back to the default when AI_MODEL is unset', () => {
    delete process.env.AI_MODEL
    expect(resolveModel()).toBe(DEFAULT_MODEL)
  })

  it('treats an EMPTY AI_MODEL as absent, not as a model id of ""', () => {
    process.env.AI_MODEL = ''
    expect(resolveModel()).toBe(DEFAULT_MODEL)
  })

  it('treats a whitespace-only AI_MODEL as absent', () => {
    process.env.AI_MODEL = '   '
    expect(resolveModel()).toBe(DEFAULT_MODEL)
  })

  it('trims a padded AI_MODEL rather than sending the padding', () => {
    process.env.AI_MODEL = '  some/other-model  '
    expect(resolveModel()).toBe('some/other-model')
  })

  it('never returns an empty string', () => {
    for (const v of ['', '   ', undefined]) {
      if (v === undefined) delete process.env.AI_MODEL
      else process.env.AI_MODEL = v
      expect(resolveModel().length).toBeGreaterThan(0)
    }
  })
})
