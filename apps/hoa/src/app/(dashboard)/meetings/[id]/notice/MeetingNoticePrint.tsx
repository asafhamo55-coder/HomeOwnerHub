'use client'

import Link from 'next/link'
import { Printer } from 'lucide-react'
import { Alert, Button } from '@homeowner-portal/ui'
import { Letterhead } from '@/components/print/Letterhead'

export interface MeetingNoticeView {
  association: string
  /** Already formatted, e.g. "Nov 6, 2026". */
  dateLabel: string
  /** The subject line of the email draft, so the paper and the email carry the same title. */
  subject: string
  /** The body from buildMeetingNoticeDraft. Every value in it is escaped by the builder. */
  bodyHtml: string
  /** The details to confirm, e.g. "Thursday, December 10, 2026, 7:00 PM" and the place. */
  when: string
  where: string
  /** Where "Change" goes. */
  changeHref: string
  /** Shown above the letter and never printed. */
  warnings?: string[]
}

/**
 * The print view of the meeting notice: one letter-size page, 12pt body,
 * black on white. The header (explainer, warnings and Print button) is
 * hidden in print so nothing prints above the letter.
 */
export function MeetingNoticePrint({ view }: { view: MeetingNoticeView }) {
  return (
    <div className="space-y-5">
      <div className="space-y-3 print:hidden" data-testid="meeting-notice-header">
        <Alert variant="info" title="The paper copy of the meeting notice">
          Print it to post in the clubhouse or on the mailbox board, or to mail to an owner who does not read email. You can also
          choose Save as PDF in the print window.
        </Alert>
        {(view.warnings ?? []).map((w) => (
          <Alert key={w} variant="warning" title="Check before you print">
            {w}
          </Alert>
        ))}
        <Alert variant="info" title="You are printing">
          {view.when}, at {view.where}. Is this right?{' '}
          <Link href={view.changeHref} className="inline-flex min-h-12 items-center font-medium text-primary underline-offset-2 hover:underline">
            Change
          </Link>
        </Alert>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" className="min-h-12" icon={<Printer aria-hidden />} onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </div>
      <article
        aria-label="Meeting notice"
        className="meeting-notice mx-auto [overflow-wrap:anywhere] max-w-[8.5in] space-y-4 rounded-lg border border-border bg-white p-6 text-[12pt] leading-snug text-black [print-color-adjust:exact] print:max-w-none print:rounded-none print:border-0 print:p-0"
      >
        {/* bg-white and text-black are intentional: this is paper, whatever the app theme. */}
        <style>{'@media print { @page { size: letter; margin: 0.75in; } }'}</style>
        <header className="space-y-3">
          <Letterhead name={view.association} />
          <p className="num">{view.dateLabel}</p>
          <h1 className="text-[14pt] font-bold">{view.subject}</h1>
        </header>
        <div className="[overflow-wrap:anywhere] [&_p]:mb-3" dangerouslySetInnerHTML={{ __html: view.bodyHtml }} />
      </article>
    </div>
  )
}
