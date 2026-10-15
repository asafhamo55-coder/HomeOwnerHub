import Link from 'next/link'
import { Calculator } from 'lucide-react'
import { EmptyState, LoadFailed, Page, StatusPill, type Crumb, type PageWidth } from '@homeowner-portal/ui'
import { statusOf, type StatusDef } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'

/**
 * Shown when there is no association or accounting has not been
 * bootstrapped (no funds / chart of accounts / fiscal period). The old
 * copy told board members to "run pnpm seed:accounting" — a developer
 * command they cannot run.
 */
export function AccountingNotSetUp({ title = 'Accounting', tabs = true }: { title?: string; tabs?: boolean }) {
  return (
    <Page title={title} width="default" tabs={tabs ? <AccountingTabs /> : undefined}>
      <EmptyState
        icon={<Calculator aria-hidden />}
        title="Accounting isn’t set up yet"
        description="Your association needs its funds, chart of accounts and first fiscal period before the books open. Contact support and we’ll set them up — it takes a few minutes."
      />
    </Page>
  )
}

/** A whole page whose primary read failed: title + tabs + LoadFailed. */
export function AccountingLoadFailed({
  title,
  what,
  width = 'default',
  breadcrumbs,
}: {
  title: string
  what: string
  width?: PageWidth
  breadcrumbs?: Crumb[]
}) {
  return (
    <Page
      title={title}
      width={width}
      linkAs={Link}
      breadcrumbs={breadcrumbs}
      tabs={breadcrumbs ? undefined : <AccountingTabs />}
    >
      <LoadFailed what={what} />
    </Page>
  )
}

/** "1010  Cash — Operating" with the number de-emphasised and tabular. */
export function AccountLabel({ number, name }: { number: string; name: string }) {
  return (
    <span className="inline-flex items-baseline gap-2.5">
      <span className="num w-9 shrink-0 text-xs text-muted">{number}</span>
      <span>{name}</span>
    </span>
  )
}

/** Breadcrumb trail rooted at Accounting. */
export function accountingCrumbs(...rest: [label: string, href?: string][]): Crumb[] {
  return [{ label: 'Accounting', href: '/accounting' }, ...rest.map(([label, href]) => ({ label, href }))]
}

/** A status from one of the lib/money/status registries. */
export function MoneyStatus({ registry, status }: { registry: Record<string, StatusDef>; status: string }) {
  const s = statusOf(registry, status)
  return <StatusPill tone={s.tone} label={s.label} size="sm" />
}
