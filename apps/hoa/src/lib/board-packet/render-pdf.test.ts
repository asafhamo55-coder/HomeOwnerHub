import { describe, expect, it } from 'vitest'
import { extractPdfText } from '@/lib/pdf/extract-text'
import { usd } from '@/lib/money/format'
import { renderBoardPacketPdf } from './render-pdf'
import { summarizePacket } from './pdf-summary'
import { emptyPacketFixture, packetFixture } from './pdf-fixtures'

async function text(input: Parameters<typeof renderBoardPacketPdf>[0]) {
  const buf = await renderBoardPacketPdf(input)
  expect(new TextDecoder().decode(buf.subarray(0, 5))).toBe('%PDF-')
  return extractPdfText(new Uint8Array(buf))
}

describe('board packet PDF', () => {
  it('prints exactly the figures it was given', async () => {
    const input = packetFixture()
    const { text: t, numPages } = await text(input)
    const flat = t.replace(/\s+/g, ' ')
    const shown = [
      input.balanceSheet.totalAssets,
      input.balanceSheet.totalLiabilities,
      input.balanceSheet.totalEquity,
      input.incomeStatement.totalIncome,
      input.incomeStatement.totalExpenses,
      input.incomeStatement.netIncome,
      input.cashFlow.openingCash,
      input.cashFlow.closingCash,
      input.cashFlow.totalNet,
      ...input.balanceSheet.assets.map((r) => r.balance),
      ...input.incomeStatement.expenses.map((r) => r.balance),
    ]
    for (const n of shown) expect(flat).toContain(usd(n))
    expect(flat).toContain('Maple Creek HOA')
    expect(flat).toContain('Sep 1 – Sep 30, 2026')
    // Page numbers and the association + period on every page.
    for (let i = 1; i <= numPages; i++) expect(flat).toContain(`Page ${i} of ${numPages}`)
    expect(flat.match(/Maple Creek HOA/g)!.length).toBeGreaterThanOrEqual(numPages * 2 - 1)
  })

  it('repeats the table header when a table runs onto another page', async () => {
    const { text: t, numPages } = await text(packetFixture())
    expect(numPages).toBeGreaterThan(2)
    expect(t).toContain('(continued)')
  })

  it('summary sentences come from the figures', () => {
    const s = summarizePacket(packetFixture())
    expect(s.empty).toBe(false)
    expect(s.sentences[0]).toBe(`Income was ${usd(31_500)} and expenses were ${usd(34_143.12)}, leaving ${usd(2_643.12)} more expenses than income.`)
    expect(s.sentences[1]).toContain('up $3,949.88 from $44,260.62')
    expect(s.flags).toEqual([`Expenses were higher than income by ${usd(2_643.12)} in this period.`])
    const bad = packetFixture()
    bad.balanceSheet.isBalanced = false
    expect(summarizePacket(bad).flags.join(' ')).toContain('differ by $1,999.00')
  })

  it('an empty month says so on one page, without a wall of zeros', async () => {
    const { text: t, numPages } = await text(emptyPacketFixture())
    expect(numPages).toBe(1)
    expect(t).toContain('No entries have been posted for this period.')
    expect(t).toContain('Page 1 of 1')
    expect(t).not.toContain('$0.00')
    expect(summarizePacket(emptyPacketFixture()).empty).toBe(true)
  })

  it('uses only characters Helvetica can draw (no check marks)', async () => {
    const buf = await renderBoardPacketPdf(packetFixture())
    expect(new TextDecoder('latin1').decode(buf)).not.toMatch(/[✓✗]/)
  })
})
