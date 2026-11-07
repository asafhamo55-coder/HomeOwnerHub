'use client'

import { Letterhead } from '@/components/print/Letterhead'
import { ManagedByFooter } from '@/components/print/ManagedByFooter'
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
  ownerName: string | null
  /** Two lines in standard format: street, then city, state and ZIP. */
  addressLines: string[]
  letter: string
  /** The board's "Managed by" line, printed at the foot. */
  managedBy?: string | null
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
      // Fail open: the board's letter must always be printable. A failed
      // record is reported, not a reason to hold the letter back.
      let recorded = false
      try {
        recorded = (await recordViolationLetterPrinted({ violationId: view.violationId })).ok
      } catch (e) {
        console.error('[violations.letter-print] record failed', { code: (e as { code?: string } | null)?.code ?? null })
      }
      if (!recorded) toast({ tone: 'warning', message: 'We couldn’t record this print, but you can still print.' })
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
          <Letterhead name={view.association} />
          <p className="num text-foreground-secondary">{view.dateLabel}</p>
          <div className="text-foreground">
            {view.ownerName ? <p>{view.ownerName}</p> : null}
            {view.addressLines.filter(Boolean).map((l) => (
              <p key={l}>{l}</p>
            ))}
          </div>
        </header>
        <div className="whitespace-pre-wrap leading-relaxed text-foreground">{view.letter}</div>
        <ManagedByFooter line={view.managedBy} />
      </article>
    </div>
  )
}
