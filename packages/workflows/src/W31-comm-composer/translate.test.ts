import { describe, expect, it, vi } from 'vitest'
import {
  TRANSLATE_SYSTEM_PROMPT,
  mergeFieldNames,
  parseTranslationReply,
  translateCommunication,
  translateUserPrompt,
} from './translate'

const INPUT = {
  subject: 'Pool opens Saturday, {{ recipient_name }}',
  bodyHtml: '<p>Hi {{ recipient_name }},</p><p>The pool opens May 3 at 9am.</p><p>— {{association_name}} Board</p>',
}

const GOOD = JSON.stringify({
  subject: 'La piscina abre el sábado, {{ recipient_name }}',
  bodyHtml: '<p>Hola {{ recipient_name }}:</p><p>La piscina abre el 3 de mayo a las 9am.</p><p>— Junta de {{association_name}}</p>',
})

describe('mergeFieldNames', () => {
  it('collects names with or without spaces, sorted and unique', () => {
    expect(mergeFieldNames('{{ b }} {{a}} {{ b}}')).toEqual(['a', 'b'])
  })
})

describe('parseTranslationReply', () => {
  it('accepts a reply that keeps every merge field', () => {
    expect(parseTranslationReply(GOOD, INPUT)?.subject).toContain('piscina')
  })

  it('strips code fences', () => {
    expect(parseTranslationReply('```json\n' + GOOD + '\n```', INPUT)).not.toBeNull()
  })

  it('rejects non-JSON and the wrong shape', () => {
    expect(parseTranslationReply('hola', INPUT)).toBeNull()
    expect(parseTranslationReply(JSON.stringify({ text: 'x' }), INPUT)).toBeNull()
    expect(parseTranslationReply(null, INPUT)).toBeNull()
  })

  it('rejects a reply that drops a merge field', () => {
    const dropped = JSON.stringify({ subject: 'La piscina abre', bodyHtml: '<p>Hola {{ recipient_name }}</p>' })
    expect(parseTranslationReply(dropped, INPUT)).toBeNull()
  })

  it('rejects a reply that translates or invents a merge field', () => {
    const renamed = JSON.stringify({
      subject: 'La piscina {{ nombre }}',
      bodyHtml: '<p>{{ recipient_name }} {{association_name}}</p>',
    })
    expect(parseTranslationReply(renamed, INPUT)).toBeNull()
  })
})

describe('translateCommunication', () => {
  it('sends the system prompt and the English text to the injected client', async () => {
    const complete = vi.fn(async () => GOOD)
    const r = await translateCommunication(INPUT, complete)
    expect(r.ok).toBe(true)
    expect(complete).toHaveBeenCalledTimes(1)
    const [messages] = complete.mock.calls[0] as unknown as [Array<{ role: string; content: string }>]
    expect(messages[0]).toEqual({ role: 'system', content: TRANSLATE_SYSTEM_PROMPT })
    expect(messages[1].content).toBe(translateUserPrompt(INPUT))
    expect(messages[1].content).toContain('The pool opens May 3 at 9am.')
  })

  it('retries once on an unusable reply', async () => {
    const complete = vi.fn<() => Promise<string>>().mockResolvedValueOnce('nope').mockResolvedValueOnce(GOOD)
    const r = await translateCommunication(INPUT, complete)
    expect(r.ok).toBe(true)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('gives up after two unusable replies', async () => {
    const complete = vi.fn(async () => 'nope')
    expect(await translateCommunication(INPUT, complete)).toEqual({ ok: false, reason: 'unusable_reply' })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('lets a provider failure propagate to the caller', async () => {
    const complete = vi.fn(async () => {
      throw new Error('down')
    })
    await expect(translateCommunication(INPUT, complete)).rejects.toThrow('down')
  })

  it('the prompt pins facts and merge fields', () => {
    expect(TRANSLATE_SYSTEM_PROMPT).toMatch(/Never add, drop or change a fact/)
    expect(TRANSLATE_SYSTEM_PROMPT).toMatch(/merge field/i)
  })
})
