import { chargeTypeLabel } from '@/lib/assessment-labels'
import { ManagedByFooter } from '@/components/print/ManagedByFooter'
import { telHref, type BoardContact } from '@/lib/association-contacts'
import { formatDueDate, formatUsd } from '@/lib/dues-reminders/render'
import type { PaperLetter } from '@/lib/dues-reminders/paper'
import { checksOf, type CheckSettings, type ZelleReadResult } from '@/lib/pay-by-zelle'
import { Letterhead } from '@/components/print/Letterhead'

/** How the board takes payment, already verified (pay-by-zelle.ts). Nulls mean "not set up". */
export interface PayHow {
  checks: CheckSettings | null
  zelle: { recipient: string; recipientName: string | null } | null
  instructions: string | null
}

/** Only a verified read is printed. Unverified or missing settings print nothing about payment. */
export function payHowFrom(read: ZelleReadResult): PayHow {
  const zelle = read.state === 'configured' ? read.settings : null
  return {
    checks: checksOf(read),
    zelle: zelle ? { recipient: zelle.recipient, recipientName: zelle.recipientName } : null,
    instructions: read.state === 'configured' || read.state === 'checks_only' ? read.settings.instructions : null,
  }
}

/**
 * One letter-size page per household, black on white, body 13pt. The page
 * break is in this stylesheet so a test can pin it: every letter breaks after
 * itself except the last, so no blank page follows the pile.
 */
export const LETTER_CSS = `
@media print { @page { size: letter; margin: 0.6in; } }
.paper-letter { break-after: page; page-break-after: always; background: #fff; color: #000; font-size: 13pt; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.paper-letter:last-child { break-after: auto; page-break-after: auto; }
.paper-letter .keep { break-inside: avoid; }
@media screen { .paper-letter { max-width: 8.5in; margin: 0 auto 1.5rem; padding: 0.6in; border: 1px solid #999; } }
`

export function PaperReminderLetters({
  letters,
  associationName,
  dateLabel,
  pay,
  contacts,
  managedBy,
}: {
  letters: PaperLetter[]
  associationName: string
  dateLabel: string
  pay: PayHow
  contacts: BoardContact[]
  managedBy?: string | null
}) {
  return (
    <div className="print:m-0 print:p-0">
      <style>{LETTER_CSS}</style>
      {letters.map((letter) => {
        const { packet } = letter
        const multi = packet.properties.length > 1
        return (
          <article key={letter.addressLines.join('|')} className="paper-letter" aria-label={`Dues reminder for ${letter.addressee}`}>
            <header className="keep border-b-4 border-black pb-1">
              <Letterhead name={associationName} className="[&_span]:text-[13pt] [&_span]:font-bold" />
            </header>
            <p className="mt-3">{dateLabel}</p>
            <address className="mt-3 not-italic">
              {letter.addressLines.map((line, i) => (
                <div key={`${i}-${line}`}>{line}</div>
              ))}
            </address>

            <p className="mt-4 font-bold">{letter.named ? `Hi ${letter.addressee},` : 'Hello,'}</p>
            <p>Here is everything currently outstanding on your account.</p>

            <section aria-label="Amount due" className="keep mt-3 border-4 border-black p-3">
              <p className="font-bold">Total due</p>
              <p className="text-[28pt] font-bold leading-tight">{formatUsd(packet.totalDue)}</p>
              {packet.pastDueTotal > 0 ? (
                <p className="font-bold">
                  {formatUsd(packet.pastDueTotal)} past due, oldest {packet.oldestDaysLate} {packet.oldestDaysLate === 1 ? 'day' : 'days'}
                </p>
              ) : null}
            </section>

            {packet.properties.map((property) => (
              <section key={property.unitId} className="keep mt-3" aria-label={property.label}>
                {multi ? <h2 className="font-bold">{property.label}</h2> : null}
                <ul>
                  {property.charges.map((c) => (
                    <li key={c.id} className="flex justify-between gap-4 border-b border-black py-1">
                      <span>
                        {chargeTypeLabel(c.assessmentType)}, due {formatDueDate(c.dueDate)}
                        {c.pastDue ? <strong>{` (${c.daysLate} ${c.daysLate === 1 ? 'day' : 'days'} late)`}</strong> : null}
                      </span>
                      <span className="font-bold">{formatUsd(c.balance)}</span>
                    </li>
                  ))}
                </ul>
                {multi ? <p className="text-right font-bold">Subtotal: {formatUsd(property.subtotal)}</p> : null}
              </section>
            ))}

            <section aria-label="How to pay" className="keep mt-4">
              <h2 className="text-[16pt] font-bold">How to pay</h2>
              <HowToPay pay={pay} />
            </section>

            <section aria-label="Questions" className="keep mt-3">
              <p className="font-bold">Questions about this amount? Call or write to the board.</p>
              {contacts.length > 0 ? (
                <ul>
                  {contacts.map((c) => (
                    <li key={`${c.label}-${c.name}-${c.phone}-${c.email}`}>
                      <span className="font-bold">{[c.label, c.name].filter(Boolean).join(', ')}</span>
                      {c.phone ? (
                        <>
                          {' '}
                          <a href={telHref(c.phone)} className="text-black no-underline">
                            {c.phone}
                          </a>
                        </>
                      ) : null}
                      {c.email ? <> {c.email}</> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Please ask the board for contact details.</p>
              )}
            </section>
            <ManagedByFooter line={managedBy} compact />
          </article>
        )
      })}
    </div>
  )
}

function HowToPay({ pay }: { pay: PayHow }) {
  const { checks, zelle, instructions } = pay
  if (!checks && !zelle) {
    return <p>Please contact the board to find out how to pay.</p>
  }
  return (
    <div className="space-y-1">
      {checks ? (
        <p>
          <span className="font-bold">By check:</span> make it payable to {checks.payableTo}. Mail it to {checks.mailTo}.
          {checks.dropOff ? ` Or drop it off at ${checks.dropOff}.` : ''}
        </p>
      ) : null}
      {zelle ? (
        <p>
          <span className="font-bold">By Zelle:</span> send it to {zelle.recipient}
          {zelle.recipientName ? ` (the name shown is ${zelle.recipientName})` : ''}.
        </p>
      ) : null}
      {instructions ? <p>{instructions}</p> : null}
    </div>
  )
}
