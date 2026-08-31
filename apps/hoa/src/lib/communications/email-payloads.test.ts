import { describe, it, expect } from 'vitest'
import { buildEmailPayloads } from './email-payloads'

/**
 * Two callers share this helper — sendCommunication's batched pre-send and
 * resendFailedRecipients — and both of them line results up with rows by
 * ARRAY POSITION, because sendEmailBatch returns `results[i]` for
 * `inputs[i]`. So the invariant worth pinning is not "the html is right",
 * it is that `owners` stays index-aligned with `payloads` even when some
 * recipients drop out mid-list. Getting that wrong attributes one
 * resident's message id — and their 'sent' status — to another.
 */

const BASE = {
  subject: 'Roof work at {{association_name}}',
  bodyHtml: '<p>Hi {{owner_name}}</p>',
  associationName: 'Madison Park',
}

function recipient(id: string, email: string | null, name: string | null = 'Dana') {
  return { id, email, recipient_name: name, unit_id: 'unit-1' }
}

describe('buildEmailPayloads', () => {
  it('renders ambient merge fields per recipient', () => {
    const { payloads, owners, failures } = buildEmailPayloads({
      ...BASE,
      recipients: [recipient('r1', 'dana@example.com', 'Dana')],
      senderName: 'Madison Park HOA',
    })

    expect(failures).toEqual([])
    expect(owners).toEqual(['r1'])
    expect(payloads).toEqual([
      {
        to: 'dana@example.com',
        subject: 'Roof work at Madison Park',
        html: '<p>Hi Dana</p>',
        text: undefined,
        senderName: 'Madison Park HOA',
      },
    ])
  })

  it('keeps owners index-aligned when a recipient in the middle fails to render', () => {
    // Sam has no dues_table entry, so strict rendering throws for Sam only.
    const { payloads, owners, failures } = buildEmailPayloads({
      ...BASE,
      bodyHtml: '<p>{{dues_table}}</p>',
      recipients: [
        recipient('r1', 'dana@example.com'),
        recipient('r2', 'sam@example.com', 'Sam'),
        recipient('r3', 'lee@example.com', 'Lee'),
      ],
      extraMergeFields: {
        'dana@example.com': { dues_table: '<table>D</table>' },
        'lee@example.com': { dues_table: '<table>L</table>' },
      },
    })

    expect(owners).toEqual(['r1', 'r3'])
    expect(payloads.map((p) => p.to)).toEqual(['dana@example.com', 'lee@example.com'])
    expect(payloads[1].html).toBe('<p><table>L</table></p>')
    expect(failures).toEqual([
      { recipientId: 'r2', error: 'missing merge fields: dues_table' },
    ])
  })

  it('drops a null-email recipient without reporting it as a render failure', () => {
    // Nothing to fix and nothing to retry — an addressless row is not a
    // template problem, so it must not land in `failures` where the resend
    // path would overwrite its real error message.
    const { payloads, owners, failures } = buildEmailPayloads({
      ...BASE,
      recipients: [recipient('r1', null), recipient('r2', 'lee@example.com', 'Lee')],
    })

    expect(owners).toEqual(['r2'])
    expect(payloads).toHaveLength(1)
    expect(failures).toEqual([])
  })

  it('renders bodyText only when the communication has one', () => {
    // body_text is nullable on communications; passing null must not turn
    // into a rendered empty string, which would ship a blank text part.
    const withText = buildEmailPayloads({
      ...BASE,
      bodyText: 'Hi {{owner_name}}',
      recipients: [recipient('r1', 'dana@example.com')],
    })
    const withoutText = buildEmailPayloads({
      ...BASE,
      bodyText: null,
      recipients: [recipient('r1', 'dana@example.com')],
    })

    expect(withText.payloads[0].text).toBe('Hi Dana')
    expect(withoutText.payloads[0].text).toBeUndefined()
  })

  it('lets ambient fields beat campaign-wide extraFields', () => {
    // Same precedence sendCommunication relies on: a declared wizard answer
    // must not be able to shadow {{association_name}}.
    const { payloads } = buildEmailPayloads({
      ...BASE,
      recipients: [recipient('r1', 'dana@example.com')],
      extraFields: { association_name: 'Attacker HOA' },
    })

    expect(payloads[0].subject).toBe('Roof work at Madison Park')
  })

  it('reports every recipient as a failure when a field is campaign-wide missing', () => {
    // The resend case: extraFields are not persisted, so a body that used a
    // wizard answer cannot be reproduced. Every row must come back as an
    // explicit failure rather than being sent with a blank in it.
    const { payloads, failures } = buildEmailPayloads({
      ...BASE,
      bodyHtml: '<p>{{custom_note}}</p>',
      recipients: [recipient('r1', 'dana@example.com'), recipient('r2', 'lee@example.com')],
    })

    expect(payloads).toEqual([])
    expect(failures.map((f) => f.recipientId)).toEqual(['r1', 'r2'])
    expect(failures[0].error).toMatch(/missing merge fields: custom_note/)
  })

  it('returns empty arrays for an empty recipient list', () => {
    expect(buildEmailPayloads({ ...BASE, recipients: [] })).toEqual({
      payloads: [],
      owners: [],
      failures: [],
    })
  })
})
