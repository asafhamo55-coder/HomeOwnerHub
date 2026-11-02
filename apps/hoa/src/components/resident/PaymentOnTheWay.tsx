import type { PaymentOnTheWay as Item } from '@/lib/online-payments/pay-state'

const usd = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// A bank payment the resident already started. Their balance still shows the
// charges until the bank confirms, so this note stops a second payment.
// Plain words: no "ACH", "processing" or "intent".
export function PaymentOnTheWay({ items }: { items: Item[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-3">
      {items.map((p) =>
        p.finishBankUrl ? (
          <div key={p.id} className="rounded-lg border border-border p-4 text-base">
            <p className="text-lg font-medium">Finish connecting your bank</p>
            <p className="mt-1 text-foreground-secondary">
              Your bank sent two small deposits, or a code, for your {usd(p.totalCents)} payment. This takes 1 to 2 business days. Enter
              them to finish.
            </p>
            <a
              href={p.finishBankUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-12 items-center rounded-lg bg-primary px-6 text-lg font-semibold text-primary-foreground no-underline"
            >
              Finish now
            </a>
          </div>
        ) : (
          <div key={p.id} role="status" className="rounded-lg border border-border p-4 text-base">
            <p className="text-lg font-medium">Payment on the way</p>
            <p className="mt-1 text-foreground-secondary">
              Your {usd(p.totalCents)} bank payment started. Your bank takes 3 to 5 business days. You do not need to pay again. Your
              balance updates when it is done.
            </p>
          </div>
        ),
      )}
    </div>
  )
}
