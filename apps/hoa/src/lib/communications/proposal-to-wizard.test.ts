import { describe, expect, it } from 'vitest'
import type { CommProposal } from '@homeowner-portal/workflows/W31-propose'
import { PROPOSAL_AUDIENCES } from '@homeowner-portal/workflows/W31-propose'
import { AUDIENCE_LABELS } from '@/app/(dashboard)/communications/new/AudienceStep'
import { BUILT_IN_TEMPLATES } from './built-in-templates'
import { composeSmsBody, SMS_MAX_CHARS } from './sms-body'
import { extractMergeFields } from './templates'
import { htmlToMessageText, htmlToPlainEditorText } from './plain-text'
import { localNowString, proposalToWizardFields } from './proposal-to-wizard'
import { groupUnitsByStreet } from './streets'

// BL-102 A2: the AI proposal → the announcement wizard's fields.

const PROPOSAL: CommProposal = {
  subject: '  Water off Thursday, 9am to 2pm ',
  body: 'Hi {{ recipient_name }},\n\nThe water will be **off Thursday 9am to 2pm** on Elm St.\n\n- Fill a few jugs first\n- Avoid the dishwasher\n\n{{ association_name }} Board',
  audience: 'everyone',
  street: 'Elm St',
  urgency: 'urgent',
  category: 'emergency',
  templateId: 'builtin:water-shutoff',
  sendAt: '2026-10-21T08:00',
  missingFacts: ['When does the water come back?'],
  unverifiedNumbers: [],
  why: 'A water shutoff is urgent.',
}

const ON = { smsConfigured: true, schedulingEnabled: true }

describe('proposalToWizardFields', () => {
  it('maps every field onto the wizard', () => {
    const f = proposalToWizardFields(PROPOSAL, ON)
    expect(f).toMatchObject({
      audience: 'everyone',
      category: 'emergency',
      subject: 'Water off Thursday, 9am to 2pm',
      channels: ['email', 'portal', 'sms'],
      scheduledFor: '2026-10-21T08:00',
    })
    expect(f.bodyHtml).toBe(
      '<p>Hi {{ recipient_name }},</p>\n<p>The water will be <strong>off Thursday 9am to 2pm</strong> on Elm St.</p>\n<ul><li>Fill a few jugs first</li><li>Avoid the dishwasher</li></ul>\n<p>{{ association_name }} Board</p>',
    )
    expect(f.review).toEqual({
      missingFacts: ['When does the water come back?'],
      unverifiedNumbers: [],
      street: 'Elm St',
      suggestedTemplateId: 'builtin:water-shutoff',
      droppedSendAt: null,
      why: 'A water shutoff is urgent.',
    })
  })

  it('every proposal audience is a real wizard audience', () => {
    for (const a of PROPOSAL_AUDIENCES) {
      const f = proposalToWizardFields({ ...PROPOSAL, audience: a }, ON)
      expect(AUDIENCE_LABELS[f.audience], a).toBeTruthy()
    }
  })

  it('texts only an urgent message, and only when texting is set up', () => {
    expect(proposalToWizardFields({ ...PROPOSAL, urgency: 'routine' }, ON).channels).toEqual(['email', 'portal'])
    expect(proposalToWizardFields(PROPOSAL, { ...ON, smsConfigured: false }).channels).toEqual(['email', 'portal'])
  })

  it('sends now unless asked, and drops a send time when scheduling is off', () => {
    expect(proposalToWizardFields({ ...PROPOSAL, sendAt: null }, ON).scheduledFor).toBe('')
    const off = proposalToWizardFields(PROPOSAL, { ...ON, schedulingEnabled: false })
    expect(off.scheduledFor).toBe('')
    expect(off.review.droppedSendAt).toBe('2026-10-21T08:00')
  })

  it('never applies the template itself (it would replace the drafted body)', () => {
    const f = proposalToWizardFields(PROPOSAL, ON)
    expect(f).not.toHaveProperty('templateId')
    expect(BUILT_IN_TEMPLATES.some((t) => t.id === f.review.suggestedTemplateId)).toBe(true)
  })

  it('escapes anything markup-like the model wrote, so the body is our HTML', () => {
    const f = proposalToWizardFields({ ...PROPOSAL, body: 'Hi {{ recipient_name }}, see <img src=x onerror=alert(1)> now' }, ON)
    expect(f.bodyHtml).not.toContain('<img')
    expect(f.bodyHtml).toContain('&lt;img')
  })

  it('keeps only the merge fields the send fills, and opens in the plain editor', () => {
    const f = proposalToWizardFields(PROPOSAL, ON)
    expect(extractMergeFields(f.bodyHtml)).toEqual(['association_name', 'recipient_name'])
    expect(htmlToPlainEditorText(f.bodyHtml)).toContain("Hi [Resident's name],")
  })

  it('the drafted message fits one text (279 characters), linking to the rest', () => {
    const f = proposalToWizardFields(PROPOSAL, ON)
    const sms = composeSmsBody({
      subject: f.subject,
      body: htmlToMessageText(f.bodyHtml).replace(/\s+/g, ' '),
      portalLink: 'https://www.homeownerledger.com/communications/00000000-0000-0000-0000-000000000000',
    })
    expect(sms.length).toBeLessThanOrEqual(SMS_MAX_CHARS)
  })
})

// BL-102 A5: a named street becomes the street audience when it is one of
// the HOA's streets, and is flagged for the board otherwise.
describe('proposalToWizardFields — streets', () => {
  const streets = groupUnitsByStreet(
    [
      { id: 'u1', address_line1: '1 Elm Street' },
      { id: 'u2', address_line1: '2 Elm St' },
      { id: 'u3', address_line1: '3 Maple Ct' },
    ],
    new Set(['u1']),
  )

  it('matches a real street: the audience is that street', () => {
    const f = proposalToWizardFields(PROPOSAL, { ...ON, streets })
    expect(f.audience).toBe('street')
    expect(f.street).toEqual({ key: 'elm st', ownersOnly: false })
    expect(f.review.street).toBeNull()
    expect(AUDIENCE_LABELS[f.audience]).toBeTruthy()
  })

  it('"owners on Elm St" keeps owners only', () => {
    expect(proposalToWizardFields({ ...PROPOSAL, audience: 'owners_only' }, { ...ON, streets }).street).toEqual({
      key: 'elm st',
      ownersOnly: true,
    })
  })

  it('an unknown street keeps the audience and flags it', () => {
    const f = proposalToWizardFields({ ...PROPOSAL, street: 'Oak Ave' }, { ...ON, streets })
    expect(f.audience).toBe('everyone')
    expect(f.street).toBeNull()
    expect(f.review.street).toBe('Oak Ave')
  })

  it('a street never narrows dues, violations, renters or the board', () => {
    for (const audience of ['late_on_dues', 'open_violations', 'tenants_only', 'board'] as const) {
      const f = proposalToWizardFields({ ...PROPOSAL, audience }, { ...ON, streets })
      expect(f.audience, audience).toBe(audience)
      expect(f.review.street, audience).toBe('Elm St')
    }
  })

  it('carries the urgency for the channel question', () => {
    expect(proposalToWizardFields(PROPOSAL, ON).urgency).toBe('urgent')
  })
})

describe('localNowString', () => {
  it('formats the local wall clock as the route expects', () => {
    expect(localNowString(new Date(2026, 9, 5, 7, 3))).toBe('2026-10-05T07:03')
  })
})
