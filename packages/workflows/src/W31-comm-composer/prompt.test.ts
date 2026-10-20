import { describe, expect, it } from 'vitest'
import { PROMPT_VERSION, SUPPORTED_MERGE_FIELDS, SYSTEM_PROMPT } from './prompt'

/**
 * BL-102 finding 7: W31's prompt told the model to use {{ unit_address }},
 * which the HOA send path cannot fill, so any draft using it would fail
 * every recipient under the strict render. The prompt may only name fields
 * the send supplies.
 */
describe('W31 comm composer prompt', () => {
  it('names only merge fields the send path fills', () => {
    const named = [...SYSTEM_PROMPT.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)].map((m) => m[1])
    expect(named.length).toBeGreaterThan(0)
    for (const field of named) expect(SUPPORTED_MERGE_FIELDS).toContain(field)
  })

  it('no longer mentions unit_address', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/unit_address/)
  })

  it('bumped its version for the copy change', () => {
    expect(PROMPT_VERSION).toBe('1.1.0')
  })
})
