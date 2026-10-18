import { describe, expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { MAX_FILE_BYTES, MAX_ROWS, parseRosterFile } from './parse'

// Synthetic rosters only. A minimal .xlsx is built here with fflate so the
// reader is tested against the real container format, not a mock.
function xlsx(sheetXml: string, shared: string[] = [], extra: Record<string, string> = {}): Uint8Array {
  const sst = `<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${shared
    .map((s) => `<si><t xml:space="preserve">${s}</t></si>`)
    .join('')}</sst>`
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Roster" sheetId="1" r:id="rId7"/><sheet name="Other" sheetId="2" r:id="rId8"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId8" Target="worksheets/sheet2.xml"/><Relationship Id="rId7" Target="/xl/worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/sharedStrings.xml': strToU8(sst),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`),
    'xl/worksheets/sheet2.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>wrong sheet</t></is></c></row></sheetData></worksheet>'),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, strToU8(v)])),
  })
}

describe('parseRosterFile: CSV', () => {
  it('reads headings and rows, with the spreadsheet row number of each', () => {
    const r = parseRosterFile('roster.csv', strToU8('﻿Address,Owner\r\n"1 Test Way, Unit 2",Owner One\r\n\r\n2 Test Way,"Two ""T"" Owner"\r\n'))
    expect(r).toEqual({
      ok: true,
      headers: ['Address', 'Owner'],
      rows: [
        { n: 2, cells: ['1 Test Way, Unit 2', 'Owner One'] },
        { n: 3, cells: ['2 Test Way', 'Two "T" Owner'] },
      ],
    })
  })

  it('a formula in a CSV is kept as text, never evaluated', () => {
    const r = parseRosterFile('r.csv', strToU8('Address\n=1+1\n'))
    expect(r.ok && r.rows[0].cells[0]).toBe('=1+1')
  })

  it('names blank headings and drops wholly blank rows', () => {
    const r = parseRosterFile('r.csv', strToU8('Address,,\n1 Test Way,,\n , , \n'))
    expect(r).toMatchObject({ ok: true, headers: ['Address', 'Column 2', 'Column 3'], rows: [{ n: 2 }] })
  })

  it('falls back to Windows-1252 when the file is not UTF-8', () => {
    const bytes = new Uint8Array([...strToU8('Owner\n'), 0x4a, 0x6f, 0x73, 0xe9, 0x0a]) // "José" in cp1252
    const r = parseRosterFile('r.csv', bytes)
    expect(r.ok && r.rows[0].cells[0]).toBe('José')
  })
})

describe('parseRosterFile: XLSX', () => {
  it('reads the FIRST sheet through the workbook relationships', () => {
    const sheet =
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="C2"><v>2134</v></c></row>' +
      '<row r="4"><c r="B4" t="inlineStr"><is><t>Owner &amp; Co</t></is></c><c r="A4" t="str"><f>CONCAT("2 ","Test Way")</f><v>2 Test Way</v></c></row>'
    const r = parseRosterFile('roster.xlsx', xlsx(sheet, ['Address', 'Owner', 'Zip', '1 Test Way']))
    expect(r).toEqual({
      ok: true,
      headers: ['Address', 'Owner', 'Zip'],
      rows: [
        { n: 2, cells: ['1 Test Way', '', '2134'] },
        { n: 4, cells: ['2 Test Way', 'Owner & Co', ''] },
      ],
    })
  })

  it('uses a formula’s saved value and never its formula', () => {
    const sheet =
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Balance</t></is></c></row>' +
      '<row r="2"><c r="A2"><f>SUM(B1:B9)</f><v>12.5</v></c></row>' +
      '<row r="3"><c r="A3"><f>NOW()</f></c></row>'
    const r = parseRosterFile('r.xlsx', xlsx(sheet))
    expect(r).toEqual({ ok: true, headers: ['Balance'], rows: [{ n: 2, cells: ['12.5'] }] })
  })

  it('rich-text shared strings join their runs; booleans and errors read plainly', () => {
    const sst =
      '<sst><si><r><t>Own</t></r><r><t>er</t></r><rPh><t>ignored</t></rPh></si><si><t>x</t></si></sst>'
    const bytes = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="S" r:id="rId1"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
      'xl/sharedStrings.xml': strToU8(sst),
      'xl/worksheets/sheet1.xml': strToU8(
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="b"><v>1</v></c><c r="B2" t="e"><v>#N/A</v></c></row></sheetData></worksheet>',
      ),
    })
    expect(parseRosterFile('r.xlsx', bytes)).toEqual({ ok: true, headers: ['Owner', 'x'], rows: [{ n: 2, cells: ['TRUE', ''] }] })
  })

  it('refuses a file that is not a workbook', () => {
    expect(parseRosterFile('r.xlsx', strToU8('not a zip'))).toEqual({ ok: false, error: expect.stringMatching(/couldn’t read/i) })
  })

  it('refuses an old .xls with a way forward', () => {
    expect(parseRosterFile('r.xls', new Uint8Array([0xd0, 0xcf]))).toEqual({ ok: false, error: expect.stringMatching(/\.xlsx or \.csv/) })
  })
})

describe('parseRosterFile: limits', () => {
  it('refuses a file over the size cap', () => {
    expect(parseRosterFile('r.csv', new Uint8Array(MAX_FILE_BYTES + 1))).toEqual({ ok: false, error: expect.stringMatching(/5 MB/) })
  })

  it('refuses more rows than the cap', () => {
    const csv = 'Address\n' + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `${i} Test Way`).join('\n')
    expect(parseRosterFile('r.csv', strToU8(csv))).toEqual({ ok: false, error: expect.stringMatching(/5,000 rows/) })
  })

  it('refuses an empty file and one with headings only', () => {
    expect(parseRosterFile('r.csv', strToU8(''))).toEqual({ ok: false, error: expect.stringMatching(/empty/i) })
    expect(parseRosterFile('r.csv', strToU8('Address\n'))).toEqual({ ok: false, error: expect.stringMatching(/no rows/i) })
  })

  it('refuses an unsupported file type', () => {
    expect(parseRosterFile('r.pdf', strToU8('x'))).toEqual({ ok: false, error: expect.stringMatching(/\.csv or \.xlsx/) })
  })
})
