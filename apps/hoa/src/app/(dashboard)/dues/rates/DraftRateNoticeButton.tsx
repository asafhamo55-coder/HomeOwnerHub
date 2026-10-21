'use client'

import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { sessionStore } from '@/lib/budget-notice/draft-handoff'
import { RATE_NOTICE_WIZARD_HREF, writeRateNoticeDraft, type RateNoticeDraft } from '@/lib/dues-rates/notice'

/**
 * BL-137: open the owner notice for the upcoming dues change in Messages,
 * as a draft (this tab's sessionStorage). Nothing is sent from here; the
 * composer's normal send, with the outbound guard, is the only way out.
 */
export function DraftRateNoticeButton({ draft }: { draft: RateNoticeDraft }) {
  const router = useRouter()
  const toast = useToast()

  function open() {
    if (!writeRateNoticeDraft(sessionStore(), draft)) {
      toast({ tone: 'error', title: 'Couldn’t open the draft', message: 'This browser blocked saving the draft. Allow site data for this page and try again.' })
      return
    }
    router.push(RATE_NOTICE_WIZARD_HREF)
  }

  return (
    <Button variant="secondary" size="sm" onClick={open} icon={<Megaphone aria-hidden />}>
      Draft owner notice
    </Button>
  )
}
