import type { MailingLabel } from '@/lib/properties/roster/labels'

/**
 * Avery 5160 / 8160 geometry, letter paper, zero page margin:
 * 0.5in top, 0.1875in left, labels 2.625in x 1in, 0.125in between columns.
 * Height: 0.5 + 10 x 1 + 0.5 = 11in. Width: 0.1875 + 3 x 2.625 + 2 x 0.125 + 0.1875 = 8.5in.
 */
const SHEET_CSS = `
@media print { @page { size: letter; margin: 0; } }
.label-sheet { width: 8.5in; height: 11in; box-sizing: border-box; padding: 0.5in 0.1875in; display: grid; grid-template-columns: repeat(3, 2.625in); grid-auto-rows: 1in; column-gap: 0.125in; row-gap: 0; break-after: page; page-break-after: always; background: #fff; color: #000; }
.label-sheet:last-child { break-after: auto; page-break-after: auto; }
.label-cell { width: 2.625in; height: 1in; box-sizing: border-box; padding: 0.1in 0.15in; overflow: hidden; font: 10pt/1.2 Arial, Helvetica, sans-serif; }
.label-cell p { margin: 0; }
@media screen { .label-sheet { margin: 0 auto 1rem; border: 1px solid #999; } .label-preview { overflow-x: auto; } }
`

export function LabelSheets({ sheets }: { sheets: MailingLabel[][] }) {
  return (
    <div className="label-preview [print-color-adjust:exact] print:overflow-visible">
      <style>{SHEET_CSS}</style>
      {sheets.map((sheet, i) => (
        <section key={i} className="label-sheet" aria-label={`Sheet ${i + 1} of ${sheets.length}`}>
          {sheet.map((label) => (
            <div key={label.propertyId} className="label-cell">
              {label.lines.map((line, j) => (
                <p key={j}>{line}</p>
              ))}
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
