import { describe, it, expect } from 'vitest'
import { buildRecipientBag } from './merge-bag'
import { renderTemplateStrict } from './templates'
import { SUBJECT_TEMPLATE } from '@/lib/dues-reminders/render'

/**
 * Guards the contract send.ts actually relies on.
 *
 * An earlier version of this file asserted that an absent field "renders
 * as empty rather than throwing", exercised against the non-strict
 * renderTemplate. That stopped being send.ts's contract when the send
 * path moved to renderTemplateStrict, which throws — but the test kept
 * passing, because it called renderTemplate directly rather than the
 * renderer send.ts uses. It read like a guard while protecting nothing.
 *
 * These tests go through buildRecipientBag + renderTemplateStrict: the
 * same two functions, in the same order, that deliverOne calls.
 */

const RECIPIENT = {
  email: 'dana@example.com',
  recipient_name: 'Dana',
  unit_id: 'unit-1',
}

describe('buildRecipientBag precedence', () => {
  it('renders a per-recipient HTML fragment through a placeholder', () => {
    const bag = buildRecipientBag({
      recipient: RECIPIENT,
      associationName: 'Madison Park',
      extraMergeFields: {
        'dana@example.com': { dues_table: '<table><tr><td>$310.00</td></tr></table>' },
      },
    })

    expect(renderTemplateStrict('Hi {{owner_name}}, {{dues_table}}', bag)).toBe(
      'Hi Dana, <table><tr><td>$310.00</td></tr></table>',
    )
  })

  it('lets ambient fields beat campaign-wide extraFields', () => {
    // A declared question in the wizard must not be able to shadow
    // {{association_name}} — that is what the ambient layer is for.
    const bag = buildRecipientBag({
      extraFields: { association_name: 'Attacker HOA', custom_note: 'Roof work Friday' },
      recipient: RECIPIENT,
      associationName: 'Madison Park',
    })

    expect(bag.association_name).toBe('Madison Park')
    expect(bag.custom_note).toBe('Roof work Friday')
  })

  it('lets per-recipient fields beat ambient fields', () => {
    // Dues reminders deliberately override association_name with an
    // HTML-escaped copy for their own campaign.
    const bag = buildRecipientBag({
      recipient: RECIPIENT,
      associationName: 'Smith & Sons HOA',
      extraMergeFields: {
        'dana@example.com': { association_name: 'Smith &amp; Sons HOA' },
      },
    })

    expect(bag.association_name).toBe('Smith &amp; Sons HOA')
  })

  it('falls back to Resident when the recipient has no name', () => {
    const bag = buildRecipientBag({
      recipient: { email: null, recipient_name: null, unit_id: null },
      associationName: 'Madison Park',
    })

    expect(bag.owner_name).toBe('Resident')
    expect(bag.recipient_name).toBe('Resident')
    expect(bag.unit_id).toBe('')
  })
})

describe('strict rendering is the send-path contract', () => {
  it('throws on an absent placeholder rather than rendering it empty', () => {
    const bag = buildRecipientBag({
      recipient: RECIPIENT,
      associationName: 'Madison Park',
    })

    // The blank-subject failure mode this replaced is worse than a loud
    // one: an owner receiving a dues email with an empty subject line.
    expect(() => renderTemplateStrict('A{{nope}}B', bag)).toThrow(/missing merge fields: nope/)
  })

  it('throws when a per-recipient field is missing for this recipient only', () => {
    const fields = { 'dana@example.com': { dues_table: '<table></table>' } }

    const dana = buildRecipientBag({
      recipient: RECIPIENT,
      associationName: 'Madison Park',
      extraMergeFields: fields,
    })
    const other = buildRecipientBag({
      recipient: { email: 'sam@example.com', recipient_name: 'Sam', unit_id: 'unit-2' },
      associationName: 'Madison Park',
      extraMergeFields: fields,
    })

    expect(renderTemplateStrict('{{dues_table}}', dana)).toBe('<table></table>')
    expect(() => renderTemplateStrict('{{dues_table}}', other)).toThrow(/dues_table/)
  })
})

describe('the email key cannot leak data between recipients', () => {
  it('skips the per-recipient lookup entirely when email is null', () => {
    // SMS and portal recipients carry email: null. An unguarded lookup
    // would key them all on '' and hand them each other's merge data.
    const fields = { '': { dues_table: 'SOMEONE ELSE BALANCE' } }

    const bag = buildRecipientBag({
      recipient: { email: null, recipient_name: 'Sam', unit_id: 'unit-2' },
      associationName: 'Madison Park',
      extraMergeFields: fields,
    })

    expect(bag.dues_table).toBeUndefined()
  })

  it('does not match an email that differs only by case', () => {
    // packets.ts normalizes to lowercase before keying, and send.ts
    // inserts recipient.email verbatim, so the two agree. This pins that
    // agreement: if either side ever starts re-casing, this fails here
    // rather than as a silent send failure in production.
    const bag = buildRecipientBag({
      recipient: { email: 'Dana@Example.com', recipient_name: 'Dana', unit_id: 'unit-1' },
      associationName: 'Madison Park',
      extraMergeFields: { 'dana@example.com': { dues_table: '<table></table>' } },
    })

    expect(bag.dues_table).toBeUndefined()
  })
})

describe('the dues reminder subject survives the real send path', () => {
  it('renders strictly from the fields sendDuesReminders supplies', () => {
    // SUBJECT_TEMPLATE draws both of its fields from extraMergeFields,
    // not from the ambient layer, so it is the sharpest test that the
    // per-recipient bag reaches the strict renderer intact.
    const bag = buildRecipientBag({
      recipient: RECIPIENT,
      associationName: 'Madison Park',
      extraMergeFields: {
        'dana@example.com': {
          association_name_text: 'Madison Park',
          amount_summary: '$310.00 across 2 properties',
        },
      },
    })

    expect(renderTemplateStrict(SUBJECT_TEMPLATE, bag)).toBe(
      'Madison Park dues — $310.00 across 2 properties',
    )
  })

  it('fails loudly if those per-recipient fields go missing', () => {
    const bag = buildRecipientBag({
      recipient: RECIPIENT,
      associationName: 'Madison Park',
    })

    expect(() => renderTemplateStrict(SUBJECT_TEMPLATE, bag)).toThrow(
      /association_name_text|amount_summary/,
    )
  })
})
