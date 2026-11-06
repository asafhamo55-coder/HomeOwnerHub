import { describe, expect, it } from 'vitest'
import { assertAccent } from '@/lib/email/palette'
import { buildTally, POLL_NOT_A_VOTE } from '../rules'
import {
  MULTIPLE_CHOICE_NOTE,
  POLL_ACCENT,
  cleanSubject,
  figureLabel,
  renderBarHtml,
  renderPollBarsHtml,
  renderPollOpenedEmail,
  renderPollResultsEmail,
} from './render'

function tally(votes: number[], labels?: string[]) {
  const homes = Math.max(...votes, 0)
  return buildTally(
    votes.map((v, i) => ({
      option_id: `o${i}`,
      label: labels?.[i] ?? `Option ${i}`,
      option_position: i,
      votes: v,
      homes_answered: homes,
    })),
  )
}

describe('renderBarHtml', () => {
  it('uses the percent as the fill cell width, with a track beside it', () => {
    const html = renderBarHtml(60)
    expect(html).toContain('width="60%"')
    expect(html).toContain('width:60%')
    expect(html).toContain(`bgcolor="${POLL_ACCENT}"`)
    expect(html).toContain('bgcolor="#E4DAF5"')
    expect((html.match(/<td /g) ?? []).length).toBe(2)
  })

  it('0% is a track only: no zero-width cell for Outlook to inflate', () => {
    const html = renderBarHtml(0)
    expect((html.match(/<td /g) ?? []).length).toBe(1)
    expect(html).not.toContain(POLL_ACCENT)
    expect(html).not.toContain('width="0%"')
  })

  it('100% is a fill only', () => {
    const html = renderBarHtml(100)
    expect((html.match(/<td /g) ?? []).length).toBe(1)
    expect(html).toContain(`bgcolor="${POLL_ACCENT}"`)
    expect(html).not.toContain('#E4DAF5')
  })

  it('clamps nonsense to 0 to 100', () => {
    expect(renderBarHtml(140)).toContain('width="100%"')
    expect(renderBarHtml(-5)).not.toContain(POLL_ACCENT)
    expect(renderBarHtml(Number.NaN)).not.toContain(POLL_ACCENT)
  })

  it('is tables and colours only: no image, svg or background-image, and text matches fill', () => {
    const html = renderBarHtml(40)
    expect(html).not.toMatch(/<img|<svg|background-image|linear-gradient/i)
    expect(html).toContain('role="presentation"')
    // Dark-mode safety: the cell text colour equals its fill.
    expect(html).toContain(`background-color:${POLL_ACCENT};color:${POLL_ACCENT}`)
    expect(html).toContain('background-color:#E4DAF5;color:#E4DAF5')
  })

  it('the accent survives dark-mode inversion (same window the other emails use)', () => {
    expect(() => assertAccent(POLL_ACCENT)).not.toThrow()
  })
})

describe('renderPollBarsHtml', () => {
  it('shows "N homes (P%)" in text beside every bar', () => {
    const html = renderPollBarsHtml(tally([3, 1, 0]).rows)
    expect(html).toContain('3 homes (100%)')
    expect(html).toContain('1 home (33%)')
    expect(html).toContain('0 homes (0%)')
  })

  it('escapes answer labels so HTML cannot be injected', () => {
    const evil = '<script>alert(1)</script> & "x"'
    const html = renderPollBarsHtml(tally([1, 0], [evil, 'Fine']).rows)
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;')
  })

  it('formats the figure the same way everywhere', () => {
    expect(figureLabel(1, 50)).toBe('1 home (50%)')
    expect(figureLabel(2, 100)).toBe('2 homes (100%)')
  })
})

describe('renderPollResultsEmail', () => {
  const base = { associationName: 'Maple Court', title: 'Paint the fence?', homesAnswered: 4, resultsUrl: 'https://app.test/resident/polls/p1' }

  it('shows the question, the homes that answered, each answer with a bar, and the link', () => {
    const t = tally([3, 1], ['Yes', 'No'])
    const e = renderPollResultsEmail({ ...base, rows: t.rows, homesAnswered: t.homesAnswered, allowMultiple: false })
    expect(e.subject).toBe('Poll results: Paint the fence?')
    for (const part of ['Paint the fence?', '3 homes answered this poll.', 'Yes', '3 homes (100%)', 'No', '1 home (33%)', 'See the results', base.resultsUrl]) {
      expect(e.html).toContain(part)
    }
    expect(e.html).toContain('width="100%"')
    expect(e.html).toContain('width="33%"')
    // The text version carries the same figures with no HTML.
    expect(e.text).toContain('Yes: 3 homes (100%)')
    expect(e.text).toContain('No: 1 home (33%)')
    expect(e.text).not.toMatch(/<[a-z]/i)
    expect(e.html).toContain(POLL_NOT_A_VOTE)
  })

  it('adds the multiple-choice note only when homes could pick several', () => {
    const t = tally([3, 3], ['A', 'B'])
    const multi = renderPollResultsEmail({ ...base, rows: t.rows, homesAnswered: 3, allowMultiple: true })
    const single = renderPollResultsEmail({ ...base, rows: t.rows, homesAnswered: 3, allowMultiple: false })
    expect(multi.html).toContain(MULTIPLE_CHOICE_NOTE)
    expect(multi.text).toContain(MULTIPLE_CHOICE_NOTE)
    expect(single.html).not.toContain(MULTIPLE_CHOICE_NOTE)
  })

  it('says so when nobody answered, and never invents a percent', () => {
    const t = tally([0, 0])
    const e = renderPollResultsEmail({ ...base, rows: t.rows, homesAnswered: 0, allowMultiple: false })
    expect(e.html).toContain('No homes answered this poll.')
    expect(e.html).toContain('0 homes (0%)')
    expect(e.html).not.toContain(POLL_ACCENT.toLowerCase() + ' width')
  })

  it('never carries a name or an address, only home counts', () => {
    const t = tally([2, 1])
    const e = renderPollResultsEmail({ ...base, rows: t.rows, homesAnswered: 2, allowMultiple: false })
    expect(e.html).toContain('never shown by name')
    expect(e.html).not.toMatch(/@/)
  })

  it('escapes the question and the association name', () => {
    const t = tally([1, 0])
    const e = renderPollResultsEmail({
      ...base,
      title: '<b>Hi</b>',
      associationName: 'A & B <HOA>',
      rows: t.rows,
      homesAnswered: 1,
      allowMultiple: false,
    })
    expect(e.html).not.toContain('<b>Hi</b>')
    expect(e.html).toContain('&lt;b&gt;Hi&lt;/b&gt;')
    expect(e.html).toContain('A &amp; B &lt;HOA&gt;')
  })
})

describe('renderPollOpenedEmail', () => {
  const base = {
    associationName: 'Maple Court',
    title: 'Paint the fence?',
    description: 'Line one\n\nLine <two>',
    options: ['Yes', 'No', '<i>Maybe</i>'],
    allowMultiple: false,
    closesOnLabel: 'November 12, 2026',
    pollUrl: 'https://app.test/resident/polls/p1',
  }

  it('has the question, the answers as text, the closing date, the not-a-vote line and a big button', () => {
    const e = renderPollOpenedEmail(base)
    expect(e.subject).toBe('Poll: Paint the fence?')
    for (const part of ['Paint the fence?', 'Yes', 'No', 'Please answer by November 12, 2026.', 'Pick one answer.', 'Answer the poll', base.pollUrl, POLL_NOT_A_VOTE]) {
      expect(e.html).toContain(part)
      if (part !== 'Answer the poll') expect(e.text).toContain(part)
    }
    expect(e.html).toContain('font-size:17px')
    expect(e.html).toContain('<li')
  })

  it('escapes answers and the description', () => {
    const e = renderPollOpenedEmail(base)
    expect(e.html).not.toContain('<i>Maybe</i>')
    expect(e.html).toContain('&lt;i&gt;Maybe&lt;/i&gt;')
    expect(e.html).toContain('Line &lt;two&gt;')
  })

  it('names several answers when homes may pick more than one, and copes with no end date', () => {
    const e = renderPollOpenedEmail({ ...base, allowMultiple: true, closesOnLabel: null })
    expect(e.html).toContain('You can pick more than one answer.')
    expect(e.html).not.toContain('Please answer by')
  })

  it('keeps line breaks and control characters out of the subject', () => {
    const e = renderPollOpenedEmail({ ...base, title: 'Fence\r\nBcc: x@y.test' })
    expect(e.subject).not.toMatch(/[\r\n]/)
    expect(cleanSubject('a\r\nb')).toBe('a b')
  })

  it('uses no em dashes', () => {
    const e = renderPollOpenedEmail(base)
    const r = renderPollResultsEmail({ associationName: 'X', title: 'T', rows: tally([1, 0]).rows, homesAnswered: 1, allowMultiple: true, resultsUrl: 'https://a.test/x' })
    expect(e.html + e.text + r.html + r.text).not.toContain('—')
  })
})
