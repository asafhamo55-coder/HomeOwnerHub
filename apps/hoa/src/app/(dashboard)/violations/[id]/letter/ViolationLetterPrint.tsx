'use client'

import { useTransition } from 'react'
import { Printer } from 'lucide-react'
import { Alert, Button, useToast } from '@homeowner-portal/ui'
import { DraftPrintBanner, usePrintGate } from '@/components/print/PrintGate'
import { recordViolationLetterPrinted } from '@/lib/violations/letter-print-actions'

export interface ViolationLetterView {
  violationId: string
  association: string | null
  /** Already formatted, e.g. "Nov 6, 2026". */
  dateLabel: string
  /** YYYY-MM-DD, for the print record. */
  letterDate: string
  ownerName: string | null
  /** Two lines in standard format: street, then city, state and ZIP. */
  addressLines: string[]
  letter: string
}

/**
 * The print view of one approved violation notice. Same pattern as the
 * collections letter: the Print button records the print, then arms the
 * document and opens the browser's print dialog. Only the letter prints.
 * A browser print (Cmd+P) without the button shows a draft banner instead.
 */
export function ViolationLetterPrint({ view }: { view: ViolationLetterView }) {
  const toast = useToast()
  const gate = usePrintGate()
  const [isPending, startTransition] = useTransition()

  function print() {
    startTransition(async () => {
      const res = await recordViolationLetterPrinted({ violationId: view.violationId, letterDate: view.letterDate })
      if (!res.ok) {
        toast({ tone: 'error', title: 'Not printed', message: res.error })
        return
      }
      gate.print()
    })
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3 print:hidden">
        <Alert variant="info" title="This is the letter as the board approved it">
          Print it on your association’s paper, or choose Save as PDF in the print window.
        </Alert>
        <Button type="button" size="lg" className="min-h-12" icon={<Printer aria-hidden />} onClick={print} disabled={isPending} loading={isPending}>
          Print / Save as PDF
        </Button>
      </div>
      <DraftPrintBanner armed={gate.printArmed} />
      <article
        aria-label="Violation notice"
        className={`space-y-4 rounded-lg border border-border bg-surface p-5 text-sm print:border-0 print:p-0 ${gate.docClass}`}
      >
        <header className="space-y-3">
          {view.association ? <p className="text-base font-semibold text-foreground">{view.association}</p> : null}
          <p className="num text-foreground-secondary">{view.dateLabel}</p>
          <div className="text-foreground">
            {view.ownerName ? <p>{view.ownerName}</p> : null}
            {view.addressLines.filter(Boolean).map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </header>
        <div className="whitespace-pre-wrap leading-relaxed text-foreground">{view.letter}</div>
      </article>
    </div>
  )
}
