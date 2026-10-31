import Link from 'next/link'
import { ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react'
import { Button } from '@homeowner-portal/ui'
import type { DoNext } from '@/lib/dashboard/do-next'

/**
 * The first thing on the board dashboard: the one item to do next, in plain
 * words, with one large button. Presentational; lib/dashboard/do-next.ts
 * decides what to say. "Unsure" is never dressed up as "all caught up".
 */
export function DoNextCard({ next }: { next: DoNext }) {
  return (
    <section
      aria-labelledby="do-next-heading"
      className="rounded-2xl border border-primary bg-primary-subtle p-5 sm:p-6"
    >
      <h2 id="do-next-heading" className="text-sm font-semibold uppercase tracking-wide text-primary">
        Do this next
      </h2>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-3 text-xl font-semibold leading-snug text-foreground">
          {next.kind === 'caught_up' ? <CheckCircle2 className="mt-1 size-6 shrink-0 text-success" aria-hidden /> : null}
          <span>{next.message}</span>
        </p>
        {next.kind === 'caught_up' ? null : (
          <Button
            asChild
            size="lg"
            icon={next.kind === 'unsure' ? <RefreshCw /> : <ArrowRight />}
            className="min-h-12 w-full shrink-0 text-base sm:w-auto"
          >
            <Link href={next.href} prefetch={false}>
              {next.cta}
            </Link>
          </Button>
        )}
      </div>
    </section>
  )
}
