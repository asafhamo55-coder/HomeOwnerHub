'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { sessionStore } from '@/lib/budget-notice/draft-handoff'
import type { AnnualReport } from '@/lib/annual-report/model'
import { ANNUAL_REPORT_WIZARD_HREF, NARRATIVE_MAX, annualReportMessage, narrativeParagraphs, writeAnnualReportDraft } from '@/lib/annual-report/message'

/**
 * BL-153: the board's short narrative, and the way to the owner message.
 *
 * The narrative lives in this tab only: it prints with the report and goes
 * into the message draft, and nothing is saved on the server. "Draft
 * message to owners" hands the composer a message built from the report
 * the server already made owner-safe (sessionStorage, like the HO-6
 * notice); the composer's normal send, with the outbound guard, is the
 * only way anything leaves.
 */
export function BoardMessage({ report }: { report: AnnualReport }) {
  const id = useId()
  const router = useRouter()
  const toast = useToast()
  const [text, setText] = useState('')
  const paragraphs = narrativeParagraphs(text)

  function draft() {
    if (!writeAnnualReportDraft(sessionStore(), annualReportMessage(report, text))) {
      toast({ tone: 'error', title: 'Couldn’t open the draft', message: 'This browser blocked saving the draft. Allow site data for this page and try again.' })
      return
    }
    router.push(ANNUAL_REPORT_WIZARD_HREF)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 print:hidden">
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          A short message from the board
        </label>
        <p className="text-sm text-muted">
          The year in a few lines: what was done, what is coming, and anything owners should know. It prints with the report and goes into the
          message draft. It isn’t saved, so print or draft the message before you leave this page.
        </p>
        <textarea
          id={id}
          value={text}
          maxLength={NARRATIVE_MAX}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-base text-foreground"
          placeholder="This year the board…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" onClick={draft} icon={<Megaphone aria-hidden />}>
            Draft message to owners
          </Button>
          <span className="text-xs text-muted">Opens Messages with the report’s summary, addressed to owners. Nothing is sent.</span>
        </div>
      </div>
      <div className="hidden max-w-prose space-y-3 text-base leading-relaxed text-foreground print:block">
        {paragraphs.length > 0 ? paragraphs.map((p, i) => <p key={i}>{p}</p>) : <p className="text-muted">No message from the board.</p>}
      </div>
    </div>
  )
}
