import Link from 'next/link'
import { Wallet } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import { checksOf, type PayLine, type ZelleReadResult } from '@/lib/pay-by-zelle'
import { telHref, type BoardContact } from '@/lib/association-contacts'
import { ScreenEmpty } from '@/components/resident/screen'
import { ZellePayInstructions } from '@/components/resident/ZellePayInstructions'
import { CheckPayCard } from '@/components/resident/CheckPayCard'

// What a resident sees on the Pay screen for one association: Zelle, check,
// both, or "not set up" with the board's contact. Nothing here moves money.

export function payMethodsLabel(read: ZelleReadResult): string {
  if (read.state === 'configured') return checksOf(read) ? 'How to pay' : 'Send with Zelle'
  if (read.state === 'checks_only') return 'Pay by check'
  return 'How to pay'
}

export function PayMethods({
  read,
  lines,
  amountDue,
  contacts,
  unitLabelFor,
}: {
  read: ZelleReadResult
  lines: PayLine[]
  amountDue: number
  contacts: BoardContact[]
  unitLabelFor?: (assessmentId: string) => string | null
}) {
  const checks = checksOf(read)
  if (read.state === 'configured') {
    return (
      <div className="space-y-4">
        <ZellePayInstructions
          recipient={read.settings.recipient}
          recipientName={read.settings.recipientName}
          instructions={read.settings.instructions}
          lines={lines}
          unitLabelFor={unitLabelFor}
        />
        {checks ? <CheckPayCard checks={checks} amountDue={amountDue} /> : null}
      </div>
    )
  }
  if (read.state === 'checks_only') {
    return <CheckPayCard checks={read.settings.checks} amountDue={amountDue} instructions={read.settings.instructions} />
  }
  return <NotSetUp contacts={contacts} />
}

export function NotSetUp({ contacts }: { contacts: BoardContact[] }) {
  const withReach = contacts.filter((c) => c.phone || c.email)
  return (
    <div className="space-y-4">
      <ScreenEmpty
        icon={<Wallet />}
        tone="slate"
        title="Your board hasn’t shared how to pay yet"
        description="Please contact your board and ask how to pay your dues. You can also send them a message here."
        action={
          <Button asChild variant="secondary">
            <Link href="/resident/tickets/new">Message your board</Link>
          </Button>
        }
      />
      {withReach.length > 0 ? (
        <ul className="space-y-3 rounded-xl border border-border bg-surface p-4 text-base">
          {withReach.map((c, i) => (
            <li key={i}>
              <p className="font-semibold text-foreground">{c.name ? `${c.label}: ${c.name}` : c.label}</p>
              {c.phone ? (
                <a href={telHref(c.phone)} className="inline-block py-1.5 font-medium text-primary underline-offset-2 hover:underline">
                  {c.phone}
                </a>
              ) : null}
              {c.email ? (
                <p className="break-words">
                  <a href={`mailto:${c.email}`} className="inline-block py-1.5 font-medium text-primary underline-offset-2 hover:underline">
                    {c.email}
                  </a>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
