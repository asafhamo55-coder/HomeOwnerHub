'use client'

import { useRouter } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { Button, useToast } from '@homeowner-portal/ui'
import { sessionStore } from '@/lib/budget-notice/draft-handoff'
import { HO6_NOTICE_WIZARD_HREF, writeHo6NoticeDraft, type Ho6NoticeDraft } from '@/lib/insurance/ho6-notice'

/**
 * BL-142: open the optional HO-6 notice in Messages, as a draft (this tab's
 * sessionStorage). Nothing is sent from here; the composer's normal send,
 * with the outbound guard, is the only way out.
 */
export function DraftHo6NoticeButton({ draft }: { draft: Ho6NoticeDraft }) {
  const router = useRouter()
  const toast = useToast()

  function open() {
    if (!writeHo6NoticeDraft(sessionStore(), draft)) {
      toast({ tone: 'error', title: 'Couldn’t open the draft', message: 'This browser blocked saving the draft. Allow site data for this page and try again.' })
      return
    }
    router.push(HO6_NOTICE_WIZARD_HREF)
  }

  return (
    <Button variant="secondary" size="sm" onClick={open} icon={<Megaphone aria-hidden />}>
      Draft HO-6 notice
    </Button>
  )
}
