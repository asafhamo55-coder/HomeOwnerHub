import { describe, it, expect, afterEach } from 'vitest'
import {
  DEFAULT_MODEL,
  DEFAULT_FAST_MODEL,
  DEFAULT_VISION_MODEL,
  DECOMMISSIONED_MODELS,
  NEVER_SERVED_MODELS,
  resolveModel,
  resolveFastModel,
  resolveVisionModel,
  resolveCloudModel,
  JSON_MODE_PARAMS,
} from './model'

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

describe('every default is a model some provider actually serves', () => {
  // The outage had two flavours: ids that were retired (llama-3.3) and ids
  // that never worked here at all (HuggingFace repo ids from the
  // self-hosted plan in ADR-002, which shipped as the default for four of
  // the six agents in this package). Both sets are guarded.
  const defaults = {
    DEFAULT_MODEL,
    DEFAULT_FAST_MODEL,
    DEFAULT_VISION_MODEL,
  }

  for (const [name, id] of Object.entries(defaults)) {
    it(`${name} is not decommissioned`, () => {
      expect(DECOMMISSIONED_MODELS.has(id)).toBe(false)
    })

    it(`${name} is not a never-served HuggingFace/Ollama id`, () => {
      expect(NEVER_SERVED_MODELS.has(id)).toBe(false)
    })
  }

  it('still lists the ids that caused each outage', () => {
    expect(DECOMMISSIONED_MODELS.has('llama-3.3-70b-versatile')).toBe(true)
    expect(NEVER_SERVED_MODELS.has('Qwen/Qwen2.5-14B-Instruct')).toBe(true)
    expect(NEVER_SERVED_MODELS.has('Qwen/Qwen2-VL-7B-Instruct')).toBe(true)
  })
})

describe('resolveFastModel', () => {
  const saved = { fast: process.env.AI_MODEL_FAST, shared: process.env.AI_MODEL }
  afterEach(() => {
    for (const [k, v] of [['AI_MODEL_FAST', saved.fast], ['AI_MODEL', saved.shared]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('prefers AI_MODEL_FAST', () => {
    process.env.AI_MODEL_FAST = 'fast/one'
    process.env.AI_MODEL = 'shared/one'
    expect(resolveFastModel()).toBe('fast/one')
  })

  it('falls back to the shared AI_MODEL so a partial config still works', () => {
    delete process.env.AI_MODEL_FAST
    process.env.AI_MODEL = 'shared/one'
    expect(resolveFastModel()).toBe('shared/one')
  })

  it('treats an EMPTY AI_MODEL_FAST as absent', () => {
    process.env.AI_MODEL_FAST = ''
    delete process.env.AI_MODEL
    expect(resolveFastModel()).toBe(DEFAULT_FAST_MODEL)
  })

  it('uses its own default when nothing is set', () => {
    delete process.env.AI_MODEL_FAST
    delete process.env.AI_MODEL
    expect(resolveFastModel()).toBe(DEFAULT_FAST_MODEL)
  })
})

describe('resolveVisionModel', () => {
  const saved = { vision: process.env.AI_MODEL_VISION, shared: process.env.AI_MODEL }
  afterEach(() => {
    for (const [k, v] of [['AI_MODEL_VISION', saved.vision], ['AI_MODEL', saved.shared]] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('uses AI_MODEL_VISION when set', () => {
    process.env.AI_MODEL_VISION = 'vision/one'
    expect(resolveVisionModel()).toBe('vision/one')
  })

  // The whole point of a separate resolver: DEFAULT_MODEL is text-only, so
  // borrowing it for an image request fails more confusingly than a missing
  // config would.
  it('does NOT borrow the text AI_MODEL', () => {
    delete process.env.AI_MODEL_VISION
    process.env.AI_MODEL = 'some/text-only-model'
    expect(resolveVisionModel()).toBe(DEFAULT_VISION_MODEL)
  })

  it('treats an EMPTY AI_MODEL_VISION as absent', () => {
    process.env.AI_MODEL_VISION = ''
    expect(resolveVisionModel()).toBe(DEFAULT_VISION_MODEL)
  })
})

/**
 * The `cloud` agent is what the daily digest and the dashboard's board
 * insights actually call. It resolved through an inline
 * `resolveModel(process.env.AI_MODEL_CLOUD)` in agents/cloud.ts, so
 * /api/health could not report it without duplicating the chain — and a
 * duplicated chain drifts. Named here so health reads the same function
 * the client does.
 */
describe('resolveCloudModel', () => {
  const saved = { cloud: process.env.AI_MODEL_CLOUD, shared: process.env.AI_MODEL }
  afterEach(() => {
    for (const [k, v] of [
      ['AI_MODEL_CLOUD', saved.cloud],
      ['AI_MODEL', saved.shared],
    ] as const) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  it('prefers AI_MODEL_CLOUD', () => {
    process.env.AI_MODEL_CLOUD = 'cloud/one'
    process.env.AI_MODEL = 'shared/one'
    expect(resolveCloudModel()).toBe('cloud/one')
  })

  it('falls back to the shared AI_MODEL so a partial config still works', () => {
    delete process.env.AI_MODEL_CLOUD
    process.env.AI_MODEL = 'shared/one'
    expect(resolveCloudModel()).toBe('shared/one')
  })

  it('treats an EMPTY AI_MODEL_CLOUD as absent', () => {
    // The case that matters operationally: Vercel writes "" for Sensitive
    // vars, and the stale homeowner-hub project still carries an
    // AI_MODEL_CLOUD that could be pulled into a local env file.
    process.env.AI_MODEL_CLOUD = ''
    delete process.env.AI_MODEL
    expect(resolveCloudModel()).toBe(DEFAULT_MODEL)
  })

  it('treats a whitespace-only AI_MODEL_CLOUD as absent', () => {
    process.env.AI_MODEL_CLOUD = '   '
    delete process.env.AI_MODEL
    expect(resolveCloudModel()).toBe(DEFAULT_MODEL)
  })

  it('uses the shared text default when nothing is set', () => {
    // Cloud shares DEFAULT_MODEL rather than owning one: it is the same
    // text path, just a different call site.
    delete process.env.AI_MODEL_CLOUD
    delete process.env.AI_MODEL
    expect(resolveCloudModel()).toBe(DEFAULT_MODEL)
  })

  it('never returns an empty string', () => {
    for (const value of ['', '   ', undefined]) {
      if (value === undefined) delete process.env.AI_MODEL_CLOUD
      else process.env.AI_MODEL_CLOUD = value
      delete process.env.AI_MODEL
      expect(resolveCloudModel()).not.toBe('')
    }
  })
})

describe('JSON_MODE_PARAMS', () => {
  // 'raw' is the value that broke "Ask the Docs" on 2026-08-31: gpt-oss put
  // its chain of thought in `content` next to the answer, the payload was no
  // longer valid JSON, and Groq rejected the request outright with
  // "400 Failed to generate JSON". Only 'parsed' and 'hidden' are legal in
  // JSON mode, so this asserts the value can never drift back.
  it('never uses a reasoning_format that is illegal in JSON mode', () => {
    expect(JSON_MODE_PARAMS.reasoning_format).not.toBe('raw')
    expect(['parsed', 'hidden']).toContain(JSON_MODE_PARAMS.reasoning_format)
  })

  it('opts reasoning effort down from the gpt-oss default of medium', () => {
    expect(JSON_MODE_PARAMS.reasoning_effort).toBe('low')
  })
})
