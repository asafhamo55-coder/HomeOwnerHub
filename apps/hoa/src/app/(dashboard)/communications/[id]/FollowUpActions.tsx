import Link from 'next/link'
import { Mail, MessageSquareText } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'

/**
 * The "Did people get it?" follow-up buttons. The kit's Button is
 * `whitespace-nowrap shrink-0 h-9`, so "Email again to the N who haven't
 * opened" ran past the card at 375px. Here each button is full width on
 * phones and may wrap its label; from `sm` up they sit side by side.
 */
export const FOLLOW_UP_BUTTON_CLASS =
  'h-auto min-h-9 w-full min-w-0 shrink whitespace-normal py-2 text-left sm:w-auto'

export function FollowUpActions({
  commId,
  count,
  textingReady,
}: {
  commId: string
  count: number
  textingReady: boolean
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      <Button asChild variant="secondary" className={FOLLOW_UP_BUTTON_CLASS}>
        <Link href={`/communications/new?followUp=${commId}&via=email`}>
          <Mail aria-hidden />
          <span className="min-w-0">Email again to the {count} who haven’t opened</span>
        </Link>
      </Button>
      {textingReady ? (
        <Button asChild variant="secondary" className={FOLLOW_UP_BUTTON_CLASS}>
          <Link
            href={`/communications/new?followUp=${commId}&via=text`}
            aria-label={`Text them: the ${count} who haven’t opened`}
          >
            <MessageSquareText aria-hidden />
            <span className="min-w-0">Text them</span>
          </Link>
        </Button>
      ) : null}
    </div>
  )
}
