import { describe, expect, it } from 'vitest'
import { buildEmailPayloads } from './email-payloads'
import { MANAGED_BY_MARKER, applyManagedBy, applyManagedByText, renderEmailDocument } from '@/lib/email/shell'

const LINE = 'Managed by Homeside & Sons, (404) 555-0100'
const recipients = [{ id: 'r1', email: 'ana@example.test', recipient_name: 'Ana', unit_id: null }]
const shellBody = renderEmailDocument({ bodyHtml: '<p>Hi {{recipient_name}}</p>', footerHtml: 'Sent by {{association_name}}', logo: false })

const build = (over: Partial<Parameters<typeof buildEmailPayloads>[0]> = {}) =>
  buildEmailPayloads({
    recipients,
    subject: 'Hello',
    bodyHtml: shellBody,
    bodyText: 'Hi {{recipient_name}}',
    associationName: 'Maple Court',
    ...over,
  }).payloads[0]!

describe('buildEmailPayloads, Managed by line', () => {
  it('puts the escaped row in the footer, after the footer text', () => {
    const html = build({ managedBy: LINE }).html
    expect(html).toContain('data-managed-by')
    expect(html).toContain('Managed by Homeside &amp; Sons, (404) 555-0100')
    expect(html.indexOf('Sent by Maple Court')).toBeLessThan(html.indexOf('data-managed-by'))
  })

  it('adds no row when the line is empty or missing', () => {
    for (const managedBy of [undefined, null, '', '  ']) {
      expect(build({ managedBy }).html).not.toContain('data-managed-by')
      expect(build({ managedBy }).text).toBe('Hi Ana')
    }
  })

  it('a marker inside a merge value does not move the row', () => {
    const html = build({ managedBy: LINE, recipients: [{ ...recipients[0]!, recipient_name: MANAGED_BY_MARKER }] }).html
    const row = html.indexOf('data-managed-by')
    const footer = html.indexOf('Sent by Maple Court')
    expect(footer).toBeGreaterThan(-1)
    expect(row).toBeGreaterThan(footer)
    expect(html.match(/data-managed-by/g)).toHaveLength(1)
  })

  it('applying twice gives one row, in html and text', () => {
    const once = applyManagedBy(shellBody, LINE)
    expect(applyManagedBy(once, LINE)).toBe(once)
    expect(once.match(/data-managed-by/g)).toHaveLength(1)
    const t = applyManagedByText('Hello', LINE)
    expect(applyManagedByText(t, LINE)).toBe(t)
  })

  it('adds the line as the final line of the text part', () => {
    const text = build({ managedBy: LINE }).text!
    expect(text).toBe(`Hi Ana\n\n${LINE}`)
  })

  it('a fragment body (announcement, free-form email) is branded and gets the row', () => {
    const html = build({ managedBy: LINE, bodyHtml: '<p>Pool opens Saturday.</p>' }).html
    expect(html).toMatch(/^<!DOCTYPE html/i)
    expect(html).toContain('Pool opens Saturday.')
    expect(html).toContain('class="eh-logo"')
    expect(html).toContain('Managed by Homeside &amp; Sons')
  })

  it('a fragment without a line is left alone for the sender to brand', () => {
    expect(build({ bodyHtml: '<p>Pool opens Saturday.</p>' }).html).toBe('<p>Pool opens Saturday.</p>')
  })

  it('a shell document whose marker comment was stripped still gets the row, before the closing body', () => {
    const stripped = shellBody.replace(MANAGED_BY_MARKER, '')
    const html = applyManagedBy(stripped, LINE)
    expect(html).toContain('data-managed-by')
    expect(html.indexOf('data-managed-by')).toBeLessThan(html.toLowerCase().lastIndexOf('</body>'))
  })
})
