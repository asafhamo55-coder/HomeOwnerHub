import { describe, expect, it } from 'vitest'
import { getTemplate } from '@/lib/community-templates/registry'
import { buildMergeBag } from '@/lib/community-templates/merge-bag'

// The ambient fields send.ts supplies per recipient (AMBIENT_FIELDS in
// registry.ts). Passing them keeps these calls identical to the real one.
const AMBIENT = {
  association_name: 'Madison Park',
  recipient_name: 'Dana',
  owner_name: 'Dana',
  unit_id: 'unit-1',
}

const t = getTemplate('dog-leash-and-waste')!

describe('station_locations is optional', () => {
  const base = {
    issue_type: 'pet waste left on lawns and paths',
    affected_areas: ['the mailboxes'],
  }

  it('uses the fallback when left blank', () => {
    const bag = buildMergeBag(t.questions, base, AMBIENT)
    expect(bag.station_locations).toBe('the marked points around the community')
  })

  it('does not throw when blank', () => {
    expect(() => buildMergeBag(t.questions, base, AMBIENT)).not.toThrow()
  })

  it('uses the answer when given', () => {
    const bag = buildMergeBag(t.questions, { ...base, station_locations: 'the clubhouse and the playground' }, AMBIENT)
    expect(bag.station_locations).toBe('the clubhouse and the playground')
  })

  it('still throws for the genuinely required ones', () => {
    expect(() => buildMergeBag(t.questions, { affected_areas: ['the mailboxes'] }, AMBIENT)).toThrow(/issue_type/)
  })
})

describe('the callout reads correctly either way', () => {
  const callout = t.body.find((b) => b.type === 'callout') as { type: 'callout'; text: string }
  const base = {
    issue_type: 'pet waste left on lawns and paths',
    affected_areas: ['the mailboxes'],
  }
  const render = (answers: Record<string, string | string[]>) => {
    const bag = buildMergeBag(t.questions, answers, AMBIENT)
    return callout.text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, k) => String(bag[k] ?? ''))
  }

  it('is a grammatical sentence when blank', () => {
    const out = render(base)
    expect(out).toBe(
      "You'll find bag stations at the marked points around the community. If one is empty or damaged, reply to this email and we will restock it.",
    )
    expect(out).not.toMatch(/\{\{|\bat \.|at ,/)
  })

  it('is a grammatical sentence when answered', () => {
    const out = render({ ...base, station_locations: 'the clubhouse and the playground' })
    expect(out).toBe(
      "You'll find bag stations at the clubhouse and the playground. If one is empty or damaged, reply to this email and we will restock it.",
    )
  })
})
