import type { MailingLabel } from '@/lib/properties/roster/labels'

/**
 * Avery 5160 / 8160 geometry, letter paper, zero page margin:
 * 0.5in top, 0.1875in side padding, labels 2.625in x 1in, 0.125in between columns.
 * Height 0.5 + 10 x 1 + 0.5 = 11in; the sheet is 10.99in with overflow hidden
 * so rounding never pushes a blank page after it.
 * Width 0.1875 + 3 x 2.625 + 2 x 0.125 + 0.1875 = 8.5in.
 * Names wrap to two lines, the street and the city line take one each, and the
 * city line is its own row, so it is never the part that gets cut.
 */
const SHEET_CSS = `
@media print { @page { size: letter; margin: 0; } }
.label-sheet { width: 8.5in; height: 10.99in; overflow: hidden; box-sizing: border-box; padding: 0.5in 0.1875in; display: grid; grid-template-columns: repeat(3, 2.625in); grid-auto-rows: 1in; column-gap: 0.125in; row-gap: 0; break-after: page; page-break-after: always; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.label-sheet:last-child { break-after: auto; page-break-after: auto; }
.label-cell { width: 2.625in; height: 1in; box-sizing: border-box; padding: 0.1in 0.15in; overflow: hidden; overflow-wrap: anywhere; font-family: Arial, Helvetica, sans-serif; line-height: 1.2; }
.label-cell p { margin: 0; }
.label-cell .label-name { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
.label-cell .label-line { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.label-pt-10 { font-size: 10pt; }
.label-pt-9 { font-size: 9pt; }
.label-pt-8 { font-size: 8pt; }
@media screen { .label-sheet { margin: 0 auto 1rem; border: 1px solid #999; } .label-preview { overflow-x: auto; } }
`

export function LabelSheets({ sheets }: { sheets: MailingLabel[][] }) {
  return (
    <div className="label-preview print:m-0 print:overflow-visible print:p-0">
      <style>{SHEET_CSS}</style>
      {sheets.map((sheet, i) => (
        <section key={i} className="label-sheet" aria-label={`Sheet ${i + 1} of ${sheets.length}`}>
          {sheet.map((label) => (
            <div key={label.propertyId} className={`label-cell label-pt-${label.fontPt}`}>
              {label.lines.map((line, j) => (
                <p key={j} className={j === 0 ? 'label-name' : 'label-line'}>
                  {line}
                </p>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
