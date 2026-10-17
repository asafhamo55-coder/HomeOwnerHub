import Link from 'next/link'
import { AssociationNotSetUp } from '../../_components/AssociationNotSetUp'
import { LoadFailed, Page, StatusPill, type Crumb, type PageWidth } from '@homeowner-portal/ui'
import { statusOf, type StatusDef } from '@/lib/money/status'
import { AccountingTabs } from '../AccountingTabs'

/**
 * Shown when `getAccountingContext()` found no association (it returned
 * null after a SUCCESSFUL read; a failed one is AccountingLoadFailed).
 * Older copy said "run pnpm seed:accounting", then "contact support" —
 * neither a step a board can take. Now (BL-046) an admin creates the
 * association inline, which also opens the books; a board member is sent
 * to the admins.
 */
export function AccountingNotSetUp({
  title = 'Accounting',
  tabs = true,
  returnTo = '/accounting',
}: {
  title?: string
  tabs?: boolean
  returnTo?: string
}) {
  return (
    <Page title={title} width="default" tabs={tabs ? <AccountingTabs /> : undefined}>
      <AssociationNotSetUp needFor="The books belong to an association, and this HOA doesn’t have one yet." returnTo={returnTo} />
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
