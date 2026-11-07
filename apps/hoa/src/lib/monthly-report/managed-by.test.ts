import { describe, expect, it } from 'vitest'
import { renderMonthlyReportEmail } from './render'
import { reportFixture } from './fixtures'
import { renderShellHtml, renderShellText } from '@/lib/dues-reminders/render'

const links = { appUrl: (p: string) => `https://app.example.test${p}` }
const LINE = 'Managed by Homeside & Sons, (404) 555-0100'

describe('monthly board report, Managed by line', () => {
  it('shows the escaped row in the footer and the line at the end of the text', () => {
    const { html, text } = renderMonthlyReportEmail({ ...reportFixture(), managedBy: LINE }, links)
    expect(html).toContain('data-managed-by')
    expect(html).toContain('Managed by Homeside &amp; Sons, (404) 555-0100')
    expect(text.trimEnd().endsWith(LINE)).toBe(true)
  })
  it('shows nothing without a line', () => {
    const { html, text } = renderMonthlyReportEmail(reportFixture(), links)
    expect(html).not.toContain('data-managed-by')
    expect(text).not.toContain('Managed by')
  })
})

describe('dues reminder shell, Managed by line', () => {
  it('adds the row and the final text line, with merge syntax made inert', () => {
    const html = renderShellHtml({ portalUrl: 'https://x.test/dues', managedBy: 'Managed by {{dues_table}} PM' })
    expect(html).toContain('data-managed-by')
    expect(html).toContain('Managed by {dues_table} PM')
    const text = renderShellText({ portalUrl: 'https://x.test/dues', managedBy: 'Managed by {{dues_table}} PM' })
    expect(text.endsWith('Managed by {dues_table} PM')).toBe(true)
  })
  it('caps and cleans the raw stored string in the text part', () => {
    const text = renderShellText({ portalUrl: 'https://x.test/dues', managedBy: `<b>${'a'.repeat(300)}</b>` })
    const last = text.split('\n').at(-1)!
    expect(last).toBe('a'.repeat(120))
  })
  it('is unchanged without a line', () => {
    expect(renderShellHtml({ portalUrl: 'https://x.test/dues' })).not.toContain('data-managed-by')
    expect(renderShellText({ portalUrl: 'https://x.test/dues' })).not.toContain('Managed by')
  })
})
