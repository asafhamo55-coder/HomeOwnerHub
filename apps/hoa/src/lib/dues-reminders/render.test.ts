import { describe, it, expect } from 'vitest'
import type { ReminderPacket } from './types'
import {
  SUBJECT_TEMPLATE,
  amountSummary,
  escapeHtml,
  formatDueDate,
  formatUsd,
  neutralizeMergeSyntax,
  renderDuesTableHtml,
  renderDuesTableText,
  renderNoteHtml,
  renderShellHtml,
  renderShellText,
} from './render'

function packet(overrides: Partial<ReminderPacket> = {}): ReminderPacket {
  return {
    email: 'dana@example.com',
    ownerName: 'Dana',
    userId: null,
    properties: [
      {
        unitId: 'unit-a',
        label: '14 Oak St',
        subtotal: 420,
        charges: [
          {
            id: 'a1', assessmentType: 'regular', dueDate: '2026-07-01',
            amount: 310, paid: 0, balance: 310, pastDue: true, daysLate: 39,
          },
          {
            id: 'a2', assessmentType: 'late_fee', dueDate: '2026-07-15',
            amount: 110, paid: 0, balance: 110, pastDue: true, daysLate: 25,
          },
        ],
      },
    ],
    totalDue: 420,
    pastDueTotal: 420,
    oldestDaysLate: 39,
    chargeCount: 2,
    ...overrides,
  }
}

const SIMPLE = packet({
  properties: [
    {
      unitId: 'unit-a',
      label: '14 Oak St',
      subtotal: 310,
      charges: [
        {
          id: 'a1', assessmentType: 'regular', dueDate: '2026-09-01',
          amount: 310, paid: 0, balance: 310, pastDue: false, daysLate: 0,
        },
      ],
    },
  ],
  totalDue: 310,
  pastDueTotal: 0,
  oldestDaysLate: 0,
  chargeCount: 1,
})

describe('formatting helpers', () => {
  it('formats money with cents', () => {
    expect(formatUsd(1240)).toBe('$1,240.00')
    expect(formatUsd(150.5)).toBe('$150.50')
  })

  it('formats a due date without a year', () => {
    expect(formatDueDate('2026-07-01')).toBe('Jul 1')
  })

  it('escapes HTML-significant characters', () => {
    expect(escapeHtml('<b>&"x"</b>')).toBe('&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;')
  })
})

describe('amountSummary', () => {
  it('names both totals when something is past due', () => {
    expect(amountSummary(packet())).toBe('$420.00 due, $420.00 past due')
  })

  it('names only the total when nothing is late', () => {
    expect(amountSummary(SIMPLE)).toBe('$310.00 due')
  })
})

describe('renderDuesTableHtml', () => {
  it('labels a past-due charge in text, not colour alone', () => {
    const html = renderDuesTableHtml(packet())
    expect(html).toContain('39 days late')
    expect(html).toContain('25 days late')
  })

  it('uses friendly charge type names', () => {
    const html = renderDuesTableHtml(packet())
    expect(html).toContain('Regular dues')
    expect(html).toContain('Late fee')
  })

  it('shows the grand total and the past-due total', () => {
    const html = renderDuesTableHtml(packet())
    expect(html).toContain('$420.00')
  })

  it('omits the property heading and subtotal for a single property', () => {
    const html = renderDuesTableHtml(SIMPLE)
    expect(html).not.toContain('Subtotal')
    expect(html).not.toContain('>14 Oak St<')
  })

  it('shows a heading and subtotal per property when there are several', () => {
    const multi = packet({
      properties: [
        ...packet().properties,
        {
          unitId: 'unit-b',
          label: '22 Oak St · Unit B',
          subtotal: 200,
          charges: [
            {
              id: 'b1', assessmentType: 'special', dueDate: '2026-09-01',
              amount: 200, paid: 0, balance: 200, pastDue: false, daysLate: 0,
            },
          ],
        },
      ],
      totalDue: 620,
      chargeCount: 3,
    })
    const html = renderDuesTableHtml(multi)
    expect(html).toContain('14 Oak St')
    expect(html).toContain('22 Oak St · Unit B')
    expect(html).toContain('Subtotal')
  })

  it('escapes a property label so a crafted address cannot inject markup', () => {
    // Multi-property so the heading actually renders (renderDuesTableHtml
    // only emits a property heading — the sole place a label reaches
    // visible markup — when there is more than one property).
    const nasty = packet({
      properties: [
        { ...packet().properties[0], label: '<script>x</script>' },
        {
          unitId: 'unit-b',
          label: '22 Oak St · Unit B',
          subtotal: 200,
          charges: [
            {
              id: 'b1', assessmentType: 'special', dueDate: '2026-09-01',
              amount: 200, paid: 0, balance: 200, pastDue: false, daysLate: 0,
            },
          ],
        },
      ],
      totalDue: 620,
      chargeCount: 3,
    })
    const html = renderDuesTableHtml(nasty)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('uses only inline styles — no style blocks or classes', () => {
    const html = renderDuesTableHtml(packet())
    expect(html).not.toContain('<style')
    expect(html).not.toContain('class=')
  })
})

describe('renderDuesTableText', () => {
  it('mirrors the HTML content in plain text', () => {
    const text = renderDuesTableText(packet())
    expect(text).toContain('Regular dues')
    expect(text).toContain('Jul 1')
    expect(text).toContain('$310.00')
    expect(text).toContain('39 days late')
    expect(text).not.toContain('<')
  })

  it('lists past-due charges before upcoming ones, matching the HTML order', () => {
    const text = renderDuesTableText(packet())
    expect(text.indexOf('Regular dues')).toBeLessThan(text.indexOf('Late fee'))
  })
})

describe('renderShellHtml', () => {
  it('carries the merge placeholders the send pipeline fills per recipient', () => {
    const html = renderShellHtml({ portalUrl: 'https://app.test/resident/dues' })
    expect(html).toContain('{{owner_name}}')
    expect(html).toContain('{{association_name}}')
    expect(html).toContain('{{dues_table}}')
  })

  it('links the CTA to the portal and never promises online payment', () => {
    const html = renderShellHtml({ portalUrl: 'https://app.test/resident/dues' })
    expect(html).toContain('https://app.test/resident/dues')
    expect(html).toContain('View my dues')
    expect(html).not.toContain('Pay now')
  })

  it('omits the note block entirely when no note is given', () => {
    expect(renderNoteHtml(undefined)).toBe('')
    expect(renderNoteHtml('   ')).toBe('')
  })

  it('escapes a note so a manager cannot inject markup into every resident inbox', () => {
    const html = renderShellHtml({ note: '<img src=x onerror=alert(1)>', portalUrl: 'https://app.test' })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('preserves note line breaks as <br>', () => {
    const html = renderShellHtml({ note: 'line one\nline two', portalUrl: 'https://app.test' })
    expect(html).toContain('line one<br>line two')
  })
})

describe('renderShellText', () => {
  it('carries the plain-text merge placeholder and the note', () => {
    const text = renderShellText({ note: 'Pool assessment included.', portalUrl: 'https://app.test' })
    expect(text).toContain('{{dues_text}}')
    expect(text).toContain('Pool assessment included.')
    expect(text).not.toContain('<')
  })

  it('uses the raw owner_name_text placeholder, not the escaped HTML one', () => {
    // The send pipeline's renderTemplate does not escape merge fields, so
    // the plain-text body must reference a separate, unescaped placeholder
    // — using {{owner_name}} here would let an HTML-escaped value leak
    // into a text email as literal "&amp;" etc.
    const text = renderShellText({ portalUrl: 'https://app.test' })
    expect(text).toContain('{{owner_name_text}}')
    expect(text).not.toContain('{{owner_name}}')
  })

  it('uses the raw association_name_text placeholder in both the header and the footer', () => {
    const text = renderShellText({ portalUrl: 'https://app.test' })
    expect(text.match(/\{\{association_name_text\}\}/g)).toHaveLength(2)
    expect(text).not.toContain('{{association_name}}')
  })
})

describe('SUBJECT_TEMPLATE', () => {
  it('takes the unescaped association name — a subject line is not HTML', () => {
    expect(SUBJECT_TEMPLATE).toContain('{{association_name_text}}')
    expect(SUBJECT_TEMPLATE).not.toContain('{{association_name}}')
  })
})

describe('neutralizeMergeSyntax', () => {
  // The note is baked into the shell, and the shell is then run through
  // the send pipeline's renderTemplate — which replaces an unknown
  // {{placeholder}} with an empty string. Left alone, a note mentioning a
  // merge field would silently lose those words in every resident's inbox.
  it('leaves ordinary prose untouched', () => {
    expect(neutralizeMergeSyntax('The pool fee is due with September dues.')).toBe(
      'The pool fee is due with September dues.',
    )
  })

  it('breaks a merge placeholder while keeping the words readable', () => {
    expect(neutralizeMergeSyntax('your {{balance}} is due')).toBe('your {balance} is due')
  })

  it('cannot leave a doubled brace behind, even from a longer run', () => {
    expect(neutralizeMergeSyntax('{{{balance}}}')).toBe('{balance}')
    expect(neutralizeMergeSyntax('{{{{x}}}}')).not.toContain('{{')
  })

  it('keeps a single brace as-is — renderTemplate needs two to match', () => {
    expect(neutralizeMergeSyntax('use {curly} braces')).toBe('use {curly} braces')
  })
})
