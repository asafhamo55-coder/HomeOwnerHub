import { describe, expect, it } from 'vitest'
import { renderAutoReminder, sampleReminderInput } from './auto-render'

const base = sampleReminderInput({
  associationName: 'Oak & Vine HOA',
  note: null,
  portalUrl: 'https://app.test/resident/dues',
})

describe('renderAutoReminder', () => {
  it('fills every placeholder — nothing like {{x}} reaches an inbox', () => {
    const out = renderAutoReminder(base)
    for (const part of [out.subject, out.html, out.text]) expect(part).not.toMatch(/\{\{\w+\}\}/)
  })

  it('uses the manual reminder subject, unescaped', () => {
    expect(renderAutoReminder(base).subject).toBe('Oak & Vine HOA dues — $325.00 due, $325.00 past due')
  })

  it('escapes names in HTML but not in the plain-text body', () => {
    const out = renderAutoReminder({ ...base, ownerName: 'Smith & <Sons>' })
    expect(out.html).toContain('Hi Smith &amp; &lt;Sons&gt;,')
    expect(out.html).toContain('Oak &amp; Vine HOA')
    expect(out.text).toContain('Hi Smith & <Sons>,')
  })

  it('shows the balance, due date and days late', () => {
    const out = renderAutoReminder(base)
    expect(out.text).toContain('TOTAL DUE: $325.00')
    expect(out.text).toContain('due Oct 1')
    expect(out.text).toContain('5 days late')
    expect(out.html).toContain('https://app.test/resident/dues')
  })

  it("includes the board's approved note, made inert against merge syntax", () => {
    const out = renderAutoReminder({ ...base, note: 'Your {{dues_table}} is due <b>now</b>' })
    expect(out.text).toContain('Your {dues_table} is due <b>now</b>')
    expect(out.html).toContain('Your {dues_table} is due &lt;b&gt;now&lt;/b&gt;')
  })

  it('never re-expands a value that itself looks like a placeholder', () => {
    const out = renderAutoReminder({ ...base, ownerName: '{{dues_table}}' })
    expect(out.text).toContain('Hi {{dues_table}},')
    expect(out.text.match(/TOTAL DUE/g)).toHaveLength(1)
  })
})
