'use client'

import { Printer } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { Letterhead } from '@/components/print/Letterhead'

export interface ArcLetterView {
  association: string
  /** Already formatted, e.g. "Nov 6, 2026". */
  dateLabel: string
  ownerName: string | null
  /** Two lines in standard USPS format: street, then city, state and ZIP. */
  addressLines: string[]
  /** The request title, e.g. "Back fence". */
  requestSummary: string
  /** "Approved" or "Denied". */
  decisionLabel: string
  /** The stored board_response, plain text. Rendered as text, never as HTML. */
  letterText: string
  /** Board contacts, one per line. Empty prints "Please contact the board." */
  contactLines: string[]
  /** Shown above the letter and never printed. */
  warnings?: string[]
}

/**
 * The print view of the board's ARC decision letter: one letter-size page,
 * 12pt body, black on white. The explainer and Print button are hidden in
 * print. The letter text is the stored board_response, shown as plain text
 * with its line breaks, so the paper copy is word for word what the resident
 * sees in the portal.
 */
export function ArcLetterPrint({ view }: { view: ArcLetterView }) {
  return (
    <div className="space-y-5">
      <div className="space-y-3 print:hidden" data-testid="arc-letter-header">
        <Alert variant="info" title="The paper copy of the decision letter">
          Print it on your association’s paper to mail or hand to an owner who is not online, or choose Save as PDF in the print
          window.
        </Alert>
        {(view.warnings ?? []).map((w) => (
          <Alert key={w} variant="warning" title="Check before you print">
            {w}
          </Alert>
        ))}
        <Button type="button" size="lg" className="min-h-12" icon={<Printer aria-hidden />} onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>
      <article
        aria-label="ARC decision letter"
        className="arc-letter mx-auto [overflow-wrap:anywhere] max-w-[8.5in] space-y-4 rounded-lg border border-border bg-white p-6 text-[12pt] leading-snug text-black [print-color-adjust:exact] print:max-w-none print:mt-0 print:rounded-none print:border-0 print:p-0"
      >
        <style>{'@media print { @page { size: letter; margin: 0.75in; } }'}</style>
        <header className="space-y-3">
          <Letterhead name={view.association} />
          <p className="num">{view.dateLabel}</p>
          <div>
            {view.ownerName ? <p>{view.ownerName}</p> : null}
            {view.addressLines.filter(Boolean).map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
          <h1 className="text-[14pt] font-bold">Architectural request: {view.requestSummary}</h1>
        </header>
        {view.ownerName ? <p>Dear {view.ownerName},</p> : null}
        <p>
          <strong>Decision: {view.decisionLabel}</strong>
        </p>
        {view.letterText ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{view.letterText}</p> : null}
        <div className="space-y-1 [break-before:avoid] [break-inside:avoid]" data-testid="arc-letter-signature">
          {view.contactLines.length === 0 ? (
            <p>Please contact the board.</p>
          ) : (
            <>
              <p>If you have questions, contact the board:</p>
              {view.contactLines.map((l) => (
                <p key={l}>{l}</p>
              ))}
            </>
          )}
          <p className="pt-3">{view.association} Board</p>
        </div>
      </article>
    </div>
  )
}
