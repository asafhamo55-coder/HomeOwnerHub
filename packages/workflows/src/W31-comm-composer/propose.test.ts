import { describe, expect, it, vi } from 'vitest'
import {
  numbersNotInSource,
  parseProposalReply,
  proposeCommunication,
  proposeSystemPrompt,
  proposeUserPrompt,
} from './propose'

// BL-102 A2. The model is always a mock here; nothing reaches a provider.

const TEMPLATES = [
  { id: 'builtin:water-shutoff', name: 'Water shutoff', description: 'Warn homes about a planned water shutoff.' },
  { id: 'builtin:pool-closing', name: 'Pool closing', description: 'The pool is closing.' },
]

const INPUT = {
  message: 'water will be off Thursday 9-2 on Elm St for pipe repair',
  localNow: '2026-10-20T10:15',
}

const REPLY = {
  subject: 'Water off Thursday, 9am to 2pm',
  body: 'Hi {{ recipient_name }},\n\nThe water will be **off on Thursday from 9am to 2pm** for a pipe repair on Elm St.\n\n- Fill a few jugs first\n\n{{ association_name }} Board',
  audience: 'everyone',
  street: 'Elm St',
  urgency: 'urgent',
  category: 'emergency',
  templateId: 'builtin:water-shutoff',
  sendAt: null,
  missingFacts: ['Which homes on Elm St are affected?'],
  why: 'A water shutoff affects homes soon, so it is urgent.',
}

describe('proposeSystemPrompt', () => {
  it('allows only the merge fields the send fills, and plain text', () => {
    const p = proposeSystemPrompt(TEMPLATES)
    expect(p).toContain('{{ recipient_name }} and {{ association_name }}')
    expect(p).not.toContain('unit_address')
    expect(p).toContain('PLAIN TEXT')
    expect(p).toContain('NEVER invent facts')
    expect(p).toContain('builtin:water-shutoff: Water shutoff')
  })

  it('tells the model today’s weekday so "Thursday" resolves', () => {
    expect(proposeUserPrompt(INPUT)).toContain('2026-10-20T10:15 (Tuesday)')
  })
})

describe('parseProposalReply', () => {
  it('accepts a good reply', () => {
    const p = parseProposalReply(JSON.stringify(REPLY), INPUT, TEMPLATES)
    expect(p).toMatchObject({
      audience: 'everyone',
      street: 'Elm St',
      urgency: 'urgent',
      category: 'emergency',
      templateId: 'builtin:water-shutoff',
      sendAt: null,
      missingFacts: ['Which homes on Elm St are affected?'],
      unverifiedNumbers: [],
    })
  })

  it('strips code fences', () => {
    expect(parseProposalReply('```json\n' + JSON.stringify(REPLY) + '\n```', INPUT, TEMPLATES)).not.toBeNull()
  })

  it('rejects a merge field the send cannot fill', () => {
    const bad = { ...REPLY, body: `${REPLY.body} {{ unit_address }}` }
    expect(parseProposalReply(JSON.stringify(bad), INPUT, TEMPLATES)).toBeNull()
  })

  it('rejects an HTML body', () => {
    const bad = { ...REPLY, body: '<p>Hi {{ recipient_name }}, water is off.</p>' }
    expect(parseProposalReply(JSON.stringify(bad), INPUT, TEMPLATES)).toBeNull()
  })

  it('rejects an audience outside the closed list (no street audience)', () => {
    expect(parseProposalReply(JSON.stringify({ ...REPLY, audience: 'street' }), INPUT, TEMPLATES)).toBeNull()
  })

  it('drops a template id that was not offered', () => {
    const p = parseProposalReply(JSON.stringify({ ...REPLY, templateId: 'builtin:made-up' }), INPUT, TEMPLATES)
    expect(p?.templateId).toBeNull()
  })

  it('keeps a future send time and drops a past or malformed one', () => {
    const at = (sendAt: string) => parseProposalReply(JSON.stringify({ ...REPLY, sendAt }), INPUT, TEMPLATES)?.sendAt
    expect(at('2026-10-22T08:00')).toBe('2026-10-22T08:00')
    expect(at('2026-10-19T08:00')).toBeNull()
    expect(at('Friday morning')).toBeNull()
  })

  it('flags numbers the board never typed', () => {
    const p = parseProposalReply(
      JSON.stringify({ ...REPLY, body: `${REPLY.body}\n\nWater is back by 4pm. A $50 credit applies.` }),
      INPUT,
      TEMPLATES,
    )
    expect(p?.unverifiedNumbers).toEqual(['4pm', '50'])
  })

  it('returns null for non-JSON', () => {
    expect(parseProposalReply('Sure! Here is a draft', INPUT, TEMPLATES)).toBeNull()
    expect(parseProposalReply(null, INPUT, TEMPLATES)).toBeNull()
  })
})

describe('numbersNotInSource', () => {
  it('treats :00 minutes as formatting', () => {
    expect(numbersNotInSource('from 9:00 am to 2:00 pm', 'off 9-2')).toEqual([])
    expect(numbersNotInSource('from 9:30 am', 'off 9-2')).toEqual(['9:30 am'])
  })
})

describe('proposeCommunication', () => {
  it('retries once on an unusable reply', async () => {
    const complete = vi.fn().mockResolvedValueOnce('nope').mockResolvedValueOnce(JSON.stringify(REPLY))
    const r = await proposeCommunication(INPUT, TEMPLATES, complete)
    expect(r.ok).toBe(true)
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('gives up after two unusable replies', async () => {
    const complete = vi.fn().mockResolvedValue('nope')
    expect(await proposeCommunication(INPUT, TEMPLATES, complete)).toEqual({ ok: false, reason: 'unusable_reply' })
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('lets a provider failure propagate', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('down'))
    await expect(proposeCommunication(INPUT, TEMPLATES, complete)).rejects.toThrow('down')
  })
})
