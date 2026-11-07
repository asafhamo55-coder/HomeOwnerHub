'use client'

import { Printer } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { Letterhead } from '@/components/print/Letterhead'

export interface HearingNoticeView {
  association: string
  /** Already formatted, e.g. "Nov 6, 2026". */
  dateLabel: string
  ownerName: string | null
  /** Two lines in standard USPS format: street, then city, state and ZIP. */
  addressLines: string[]
  /** The subject line of the email draft, so the paper and the email carry the same title. */
  subject: string
  /** The body from buildHearingNoticeDraft. Every value in it is escaped by the builder. */
  bodyHtml: string
  /** Shown above the letter and never printed. */
  warnings?: string[]
}

/**
 * The print view of the hearing notice: one letter-size page, 12pt body,
 * black on white. The header (explainer and Print button) is hidden in print
 * so nothing prints above the letter.
 */
export function HearingNoticePrint({ view }: { view: HearingNoticeView }) {
  return (
    <div className="space-y-5">
      <div className="space-y-3 print:hidden" data-testid="hearing-notice-header">
        <Alert variant="info" title="The paper copy of the hearing notice">
          Print it on your association’s paper to mail or hand-deliver to an owner who does not read email, or choose Save as PDF in
          the print window.
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
        aria-label="Hearing notice"
        className="hearing-notice mx-auto [overflow-wrap:anywhere] max-w-[8.5in] space-y-4 rounded-lg border border-border bg-white p-6 text-[12pt] leading-snug text-black [print-color-adjust:exact] print:max-w-none print:rounded-none print:border-0 print:p-0"
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
          <h1 className="text-[14pt] font-bold">{view.subject}</h1>
        </header>
        <div className="[overflow-wrap:anywhere] [&_p]:mb-3" dangerouslySetInnerHTML={{ __html: view.bodyHtml }} />
      </article>
    </div>
  )
}
