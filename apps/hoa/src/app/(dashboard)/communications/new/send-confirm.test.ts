import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendConfirmCopy } from './send-confirm'

const base = { audienceLabel: 'Everyone', channelsWords: 'email and text', scheduledAt: null }

describe('sendConfirmCopy', () => {
  it('names the real count and the channels', () => {
    const c = sendConfirmCopy({ ...base, count: 42 })
    expect(c.title).toBe('Send to 42 homes by email and text?')
    expect(c.confirmLabel).toBe('Send now')
  })

  it('uses the singular for one', () => {
    expect(sendConfirmCopy({ ...base, count: 1 }).title).toBe('Send to 1 home by email and text?')
  })

  it('never shows a wrong number: unknown counts name the audience', () => {
    for (const count of [0, null, undefined, Number.NaN]) {
      const t = sendConfirmCopy({ ...base, audienceLabel: 'Owners only', count }).title
      expect(t).toBe('Send to everyone in Owners only by email and text?')
      expect(t).not.toMatch(/\b0\b|NaN/)
    }
  })

  it('says scheduled sends are scheduled, with the date', () => {
    const at = new Date(2027, 0, 15, 9, 0)
    const c = sendConfirmCopy({ ...base, count: 12, scheduledAt: at })
    expect(c.title).toMatch(/^Schedule for .*2027.* to 12 homes\?$/)
    expect(c.description).not.toMatch(/right away/i)
    expect(c.confirmLabel).toBe('Schedule it')
  })

  it('has no em dashes', () => {
    const c = sendConfirmCopy({ ...base, count: 3 })
    expect(JSON.stringify(c)).not.toContain('—')
  })
})

describe('the wizard asks before sending', () => {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(path.join(here, 'NewCommunicationWizard.tsx'), 'utf8')

  it('waits for the answer, returns on cancel, and only then starts the send', () => {
    const ask = src.indexOf('await confirm(')
    const cancel = src.indexOf('if (!go) return')
    const start = src.indexOf('sendingRef.current = true')
    const send = src.indexOf('sendCommunication({')
    expect(ask).toBeGreaterThan(-1)
    expect(cancel).toBeGreaterThan(ask)
    expect(start).toBeGreaterThan(cancel)
    expect(send).toBeGreaterThan(start)
  })
})
