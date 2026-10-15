import Link from 'next/link'
import { Scale } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getAssociationState, listStatutesForState, type StatuteRow } from '@/lib/state-law'
import { tryLoad } from '@/lib/load-or-fail'
import { lawCategoryLabel, LAW_CATEGORY_LABELS, STATE_NAMES } from '@/lib/status/knowledge'
import { LegalTabs } from '@/components/knowledge/LegalTabs'

export const metadata = { title: 'Browse statutes' }

/** listStatutesForState caps at this many rows; say so when we hit it. */
const STATUTE_CAP = 500

const FILTERS = ['meetings', 'assessments', 'fines', 'foreclosure', 'records', 'architectural', 'fair_housing', 'amendments']

const columns: DataTableColumn<StatuteRow>[] = [
  {
    key: 'citation',
    header: 'Section',
    className: 'w-40 whitespace-nowrap',
    cell: (s) => <span className="num font-medium text-foreground">{s.code_citation}</span>,
  },
  {
    key: 'title',
    header: 'Title',
    mobilePrimary: true,
    cell: (s) => (
      <Link href={`/legal/browse/${s.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
        {s.title}
      </Link>
    ),
  },
  {
    key: 'topic',
    header: 'Topic',
    hideBelowLg: true,
    cell: (s) => (s.category ? <Badge variant="neutral">{lawCategoryLabel(s.category)}</Badge> : <span className="text-muted">—</span>),
  },
]

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>
}) {
  const { category } = await searchParams
  const stateResult = await tryLoad('association state', () => getAssociationState())
  const state = stateResult.ok ? stateResult.data : null
  const statutesResult = state ? await tryLoad('statutes', () => listStatutesForState(state, category)) : null

  const heading = category ? (lawCategoryLabel(category) ?? 'Statutes') : 'Statutes'
  const crumbs = category
    ? [{ label: 'State law', href: '/legal' }, { label: 'Statutes', href: '/legal/browse' }, { label: heading }]
    : [{ label: 'State law', href: '/legal' }, { label: 'Statutes' }]

  return (
    <Page
      linkAs={Link}
      breadcrumbs={crumbs}
      title={heading}
      description={
        state
          ? `${STATE_NAMES[state]} HOA statutes, as published. Open a section to read its full text.`
          : 'Your state’s HOA statutes, as published.'
      }
      meta={
        statutesResult?.ok ? (
          <Badge variant="neutral" className="num">
            {statutesResult.data.length.toLocaleString()} {statutesResult.data.length === 1 ? 'section' : 'sections'}
          </Badge>
        ) : null
      }
      tabs={<LegalTabs current="/legal/browse" />}
    >
      {!stateResult.ok ? (
        <LoadFailed what="your association’s state" />
      ) : !state ? (
        <EmptyState
          icon={<Scale aria-hidden />}
          title="No state configured"
          description="Set up your association first — statutes are shown for its state."
          action={
            <Button asChild>
              <Link href="/onboarding/setup">Finish setup</Link>
            </Button>
          }
        />
      ) : (
        <>
          <nav aria-label="Filter by topic" className="-mx-1 flex flex-wrap gap-1.5">
            <FilterChip href="/legal/browse" active={!category} label="All topics" />
            {FILTERS.map((c) => (
              <FilterChip
                key={c}
                href={`/legal/browse?category=${encodeURIComponent(c)}`}
                active={category === c}
                label={LAW_CATEGORY_LABELS[c]}
              />
            ))}
          </nav>

          {!statutesResult || !statutesResult.ok ? (
            <LoadFailed what="statutes" retryHref={category ? `/legal/browse?category=${encodeURIComponent(category)}` : '/legal/browse'} />
          ) : (
            <>
              {statutesResult.data.length >= STATUTE_CAP ? (
                <Alert variant="info" title={`Showing the first ${STATUTE_CAP} sections`}>
                  Pick a topic above to narrow the list.
                </Alert>
              ) : null}
              <DataTable
                caption={`${heading} — ${STATE_NAMES[state]}`}
                columns={columns}
                rows={statutesResult.data}
                rowKey={(s) => s.id}
                mobile="cards"
                linkAs={Link}
                empty={
                  <EmptyState
                    variant="compact"
                    icon={<Scale aria-hidden />}
                    title={category ? 'No sections on this topic' : 'No statutes loaded yet'}
                    description={
                      category
                        ? 'Try another topic, or view all statutes.'
                        : `${STATE_NAMES[state]}’s statutes haven’t been loaded for your association yet.`
                    }
                    action={
                      category ? (
                        <Button asChild variant="secondary" size="sm">
                          <Link href="/legal/browse">View all statutes</Link>
                        </Button>
                      ) : null
                    }
                  />
                }
              />
            </>
          )}
        </>
      )}
    </Page>
  )
}

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'rounded-full border border-primary bg-primary-subtle px-3 py-1 text-sm font-medium text-primary'
          : 'rounded-full border border-border bg-surface px-3 py-1 text-sm text-foreground-secondary transition-colors hover:border-border-strong hover:text-foreground'
      }
    >
      {label}
    </Link>
  )
}
