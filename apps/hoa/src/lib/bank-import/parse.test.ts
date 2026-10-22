import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cleanDescription,
  decodeStatement,
  detectFormat,
  MAX_DESCRIPTION,
  MAX_FILE_BYTES,
  MAX_ROWS,
  parseAmountCents,
  parseDate,
  parseStatement,
  type ParseResult,
} from './parse'

// BL-144: statement files from the fixtures/ folder, one per common bank
// layout, plus a hostile one. All data in them is made up.

const here = path.dirname(fileURLToPath(import.meta.url))
const fixture = (name: string) => readFileSync(path.join(here, 'fixtures', name), 'utf8')

function ok(r: ParseResult) {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`)
  return r
}

const brief = (r: ReturnType<typeof ok>) => r.rows.map((t) => [t.postedDate, t.amountCents, t.description])

describe('field readers', () => {
  it('reads US and ISO dates, and refuses impossible ones', () => {
    expect(parseDate('10/05/2026')).toBe('2026-10-05')
    expect(parseDate('1/5/26')).toBe('2026-01-05')
    expect(parseDate('2026-10-05')).toBe('2026-10-05')
    expect(parseDate('2026/10/05 00:00:00')).toBe('2026-10-05')
    expect(parseDate('20261005120000[-5:EST]')).toBe('2026-10-05')
    expect(parseDate('10-05-2026')).toBe('2026-10-05')
    expect(parseDate('2026-02-30')).toBeNull()
    expect(parseDate('13/01/2026')).toBeNull()
    expect(parseDate('1899-01-01')).toBeNull()
    expect(parseDate('yesterday')).toBeNull()
    expect(parseDate('')).toBeNull()
  })

  it('reads money as integer cents without float drift', () => {
    expect(parseAmountCents('250.00')).toBe(25_000)
    expect(parseAmountCents('-312.47')).toBe(-31_247)
    expect(parseAmountCents('$1,234.56')).toBe(123_456)
    expect(parseAmountCents('(5.00)')).toBe(-500)
    expect(parseAmountCents('12.00-')).toBe(-1200)
    expect(parseAmountCents('12.00 DR')).toBe(-1200)
    expect(parseAmountCents('12.00 CR')).toBe(1200)
    expect(parseAmountCents('+5')).toBe(500)
    expect(parseAmountCents('.5')).toBe(50)
    expect(parseAmountCents('12,50')).toBe(1250)
    expect(parseAmountCents('0.29')).toBe(29)
    expect(parseAmountCents('1.005')).toBeNull()
    expect(parseAmountCents('abc')).toBeNull()
    expect(parseAmountCents('')).toBeNull()
    expect(parseAmountCents('-')).toBeNull()
    expect(parseAmountCents('999999999999')).toBeNull()
  })

  it('strips control and bidi-override characters, collapses space, caps length', () => {
    expect(cleanDescription('  a\tb‮c\u0000d  ')).toBe('a b c d')
    expect(cleanDescription('x'.repeat(500))).toHaveLength(MAX_DESCRIPTION)
  })

  it('detects OFX by its header or root element, else CSV', () => {
    expect(detectFormat(fixture('statement-sgml.ofx'))).toBe('ofx')
    expect(detectFormat(fixture('statement-xml.qfx'))).toBe('ofx')
    expect(detectFormat(fixture('chase-style.csv'))).toBe('csv')
  })
})

describe('CSV layouts', () => {
  it('Chase-style: Details/Posting Date/Description/Amount, trailing empty cell on every row', () => {
    const r = ok(parseStatement(fixture('chase-style.csv')))
    expect(r.format).toBe('csv')
    expect(r.layout).toBe('Posting Date, Description, Amount')
    expect(brief(r)).toEqual([
      ['2026-10-01', 25_000, 'DUES DEPOSIT MP-1001-DUES'],
      ['2026-10-03', -120_000, 'ACME LANDSCAPING, LLC'],
      ['2026-10-05', -8550, 'CHECK 1042 1042'],
      ['2026-10-07', -31_247, 'CITY WATER UTILITY'],
      ['2026-10-09', 150_000, 'REMOTE DEPOSIT'],
    ])
    expect(r.issueCount).toBe(0)
  })

  it('summary preamble above the header, a balance-only row skipped as a problem', () => {
    const r = ok(parseStatement(fixture('preamble-running-balance.csv')))
    expect(brief(r)).toEqual([
      ['2026-10-02', 25_000, 'ZELLE FROM OWNER MP-1002-DUES'],
      ['2026-10-15', 50_000, 'ZELLE FROM OWNER MP-1003-DUES'],
      ['2026-10-20', -40_000, 'INSURANCE PREMIUM'],
    ])
    expect(r.issueCount).toBe(1)
    expect(r.issues[0]).toMatchObject({ line: 8, reason: 'No readable amount' })
  })

  it('headerless (date, amount, *, check, description)', () => {
    const r = ok(parseStatement(fixture('headerless.csv')))
    expect(r.layout).toMatch(/no header/)
    expect(brief(r)).toEqual([
      ['2026-10-01', 25_000, 'DUES DEPOSIT MP-1004-DUES'],
      ['2026-10-04', -7525, 'CHECK # 1043'],
      ['2026-10-06', -1999, 'POOL SUPPLY CO'],
    ])
  })

  it('separate Debit and Credit columns, semicolon-delimited, memo appended', () => {
    const r = ok(parseStatement(fixture('debit-credit-semicolon.csv')))
    expect(brief(r)).toEqual([
      ['2026-10-01', -42_000, 'Share draft 2001 Gate repair'],
      ['2026-10-02', 125_000, 'Deposit Dues batch'],
      ['2026-10-03', -500, 'Service charge'],
    ])
  })

  it('a positive amount with a DR type column is money out', () => {
    const r = ok(parseStatement('Date,Description,Amount,Type\n2026-10-01,Fee,5.00,DR\n2026-10-02,Deposit,9.00,CR\n'))
    expect(brief(r)).toEqual([
      ['2026-10-01', -500, 'Fee'],
      ['2026-10-02', 900, 'Deposit'],
    ])
  })
})

describe('hostile and broken input', () => {
  const r = ok(parseStatement(fixture('hostile.csv')))

  it('keeps formula-looking descriptions as plain text (exports neutralise them)', () => {
    expect(brief(r).slice(0, 3)).toEqual([
      ['2026-10-01', -1000, '=HYPERLINK("http://evil.example/","click")'],
      ['2026-10-02', 2000, '+SUM(A1:A9)'],
      ['2026-10-03', -3000, "@cmd|' /C calc'!A0"],
    ])
  })

  it('removes tabs and bidi overrides, and joins a quoted multi-line memo', () => {
    expect(r.rows[3]!.description).toBe('Tab and bidi override')
    expect(r.rows[4]).toMatchObject({ postedDate: '2026-10-08', amountCents: -1234, description: 'Multi line memo' })
    expect(r.rows).toHaveLength(5)
  })

  it('lists every unreadable row with its line and reason, never guessing', () => {
    expect(r.issueCount).toBe(5)
    expect(r.issues.map((i) => [i.line, i.reason])).toEqual([
      [6, 'More columns than the header (a comma inside an unquoted field?)'],
      [7, 'No readable date'],
      [8, 'Amount is zero'],
      [9, 'No readable date'],
      [10, 'No readable amount'],
    ])
    expect(r.issues[0]!.raw).toBe('2026-10-05,"PAYMENT",1,500.00')
  })

  it('refuses a file with no date or amount column', () => {
    const bad = parseStatement('Name,Address\nA,B\n')
    expect(bad).toEqual({ ok: false, error: expect.stringMatching(/couldn’t find the date and amount columns/) })
  })

  it('refuses an empty file and a header with no rows', () => {
    expect(parseStatement('   \n')).toEqual({ ok: false, error: 'The file is empty.' })
    expect(parseStatement('Date,Description,Amount\n')).toEqual({ ok: false, error: 'The file has a header row but no transactions.' })
  })

  it('refuses more than MAX_ROWS transactions whole, not truncated', () => {
    const lines = ['Date,Description,Amount']
    for (let i = 0; i <= MAX_ROWS; i++) lines.push(`2026-10-01,Row ${i},1.00`)
    const res = parseStatement(lines.join('\n'))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toMatch(/more than 5,000 transactions/)
  })

  it('refuses more than MAX_ROWS OFX transactions', () => {
    const one = '<STMTTRN><DTPOSTED>20261001<TRNAMT>1.00<NAME>X</STMTTRN>'
    const res = parseStatement(`OFXHEADER:100\n<OFX>${one.repeat(MAX_ROWS + 1)}</OFX>`)
    expect(res.ok).toBe(false)
  })

  it('decodeStatement refuses empty, oversized and binary files, and drops a BOM', () => {
    expect(decodeStatement(new Uint8Array())).toEqual({ ok: false, error: 'The file is empty.' })
    expect(decodeStatement(new Uint8Array(MAX_FILE_BYTES + 1)).ok).toBe(false)
    expect(decodeStatement(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]))).toMatchObject({ ok: false })
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('Date,Amount')])
    expect(decodeStatement(bom)).toEqual({ ok: true, text: 'Date,Amount' })
  })
})

describe('OFX / QFX', () => {
  it('OFX 1.x SGML: unclosed fields, entities decoded, check number as description, a bad date listed', () => {
    const r = ok(parseStatement(fixture('statement-sgml.ofx')))
    expect(r.format).toBe('ofx')
    expect(brief(r)).toEqual([
      ['2026-10-02', 25_000, 'DUES DEPOSIT MP-1005-DUES'],
      ['2026-10-10', -6410, 'SMITH & SONS HARDWARE'],
      ['2026-10-12', -30_000, 'Check 1044'],
    ])
    expect(r.issues.map((i) => [i.line, i.reason])).toEqual([[4, 'No readable date']])
  })

  it('OFX 2.x XML (QFX): closed tags, one-line blocks; a DTD entity is never expanded', () => {
    const r = ok(parseStatement(fixture('statement-xml.qfx')))
    expect(brief(r)).toEqual([
      ['2026-10-03', 12_500, 'ONLINE TRANSFER RESERVE CONTRIBUTION'],
      ['2026-10-15', -4200, '&xxe;'],
    ])
  })

  it('refuses surrogate code points in entities; a real astral character still decodes (SEC3-L8)', () => {
    const block = (name: string, id: string) =>
      `<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261015</DTPOSTED><TRNAMT>-1.00</TRNAMT><FITID>${id}</FITID><NAME>${name}</NAME></STMTTRN>`
    const text = [
      '<OFX><BANKTRANLIST>',
      block('HIGH&#xD800;LOW', 'S1'),
      block('LOW&#xDFFF;END', 'S2'),
      block('DEC&#55296;IMAL', 'S3'),
      block('PAIR&#xD83D;&#xDE00;SPLIT', 'S4'),
      block('SMILE &#x1F600; OK', 'S5'),
      '</BANKTRANLIST></OFX>',
    ].join('\n')
    const r = ok(parseStatement(text))
    const names = brief(r).map((b) => String(b[2]))
    expect(names).toHaveLength(5)
    // No lone surrogate survives, even when two entities would pair up.
    for (const n of names) expect(n, n).not.toMatch(/\p{Cs}/u)
    expect(names.slice(0, 4).map((n) => n.replace(/\s+/g, ' '))).toEqual(['HIGH LOW', 'LOW END', 'DEC IMAL', 'PAIR SPLIT'])
    expect(names[4]).toContain('\u{1F600}')
  })

  it('an OFX file with no transactions is refused', () => {
    expect(parseStatement('OFXHEADER:100\n<OFX></OFX>')).toEqual({ ok: false, error: 'The OFX file has no transactions in it.' })
  })
})
