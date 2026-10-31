import Link from 'next/link'
import { ExternalLink, Megaphone, Pencil, Plus, Scale } from 'lucide-react'
import {
  Alert,
  Badge,
  Button,
  DataTable,
  EmptyState,
  LoadFailed,
  Page,
  StatusBadge,
  type DataTableColumn,
} from '@homeowner-portal/ui'
import { getAssociationState, listAllUpdatesForManager, type LawUpdateAdminRow } from '@/lib/state-law'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { tryLoad } from '@/lib/load-or-fail'
import { LAW_UPDATE_LABELS, LAW_UPDATE_TONES, STATE_NAMES } from '@/lib/status/knowledge'
import { CategoryBadge, EffectivePill } from '@/components/knowledge/LawUpdateItem'
import { LegalTabs } from '@/components/knowledge/LegalTabs'
import { ArchiveButton } from './ArchiveButton'
import { DeleteUpdateButton } from './DeleteUpdateButton'
import { formatShortDate } from '@/lib/format-datetime'

export const metadata = { title: 'Law updates' }

/** listAllUpdatesForManager caps at this many rows; say so when we hit it. */
const UPDATE_CAP = 200

const baseColumns: DataTableColumn<LawUpdateAdminRow>[] = [
  {
    key: 'update',
    header: 'Update',
    mobilePrimary: true,
    cell: (u) => (
      <div className="min-w-0 max-w-xl space-y-1">
        <p className="font-medium text-foreground">{u.headline}</p>
        <p className="line-clamp-2 text-sm text-muted">{u.summary}</p>
        {u.source_url ? (
          <a
            href={u.source_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Source
            <ExternalLink className="size-3" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        ) : null}
      </div>
    ),
  },
  {
    key: 'topic',
    header: 'Topic',
    hideBelowLg: true,
    cell: (u) => (u.category ? <CategoryBadge category={u.category} /> : <span className="text-muted">—</span>),
  },
  {
    key: 'effective',
    header: 'Effective',
    cell: (u) => (u.effective_date ? <EffectivePill date={u.effective_date} /> : <span className="text-muted">—</span>),
  },
  {
    key: 'posted',
    header: 'Posted',
    hideBelowLg: true,
    cell: (u) => <span className="num whitespace-nowrap text-muted">{formatShortDate(u.posted_at)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (u) => (
      <StatusBadge status={u.archived_at ? 'archived' : 'live'} tones={LAW_UPDATE_TONES} labels={LAW_UPDATE_LABELS} />
    ),
  },
]

/** Edit controls are for the platform team only (BL-175b H5); boards read. */
const editColumn: DataTableColumn<LawUpdateAdminRow> = {
  key: 'actions',
  header: <span className="sr-only">Actions</span>,
  cell: (u) => (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="sm">
        <Link href={`/legal/updates/${u.id}/edit`}>
          <Pencil aria-hidden />
          Edit
          <span className="sr-only">: {u.headline}</span>
        </Link>
      </Button>
      <ArchiveButton updateId={u.id} archived={!!u.archived_at} headline={u.headline} />
      <DeleteUpdateButton updateId={u.id} headline={u.headline} />
    </div>
  ),
}

export default async function UpdatesAdminPage() {
  const canEdit = await isPlatformAdmin()
  const columns = canEdit ? [...baseColumns, editColumn] : baseColumns
  const stateResult = await tryLoad('association state', () => getAssociationState())
  const state = stateResult.ok ? stateResult.data : null
  const updatesResult = state ? await tryLoad('law updates', () => listAllUpdatesForManager(state)) : null

  const updates = updatesResult?.ok ? updatesResult.data : []
  const live = updates.filter((u) => !u.archived_at).length
  const archived = updates.length - live

  return (
    <Page
      linkAs={Link}
      breadcrumbs={[{ label: 'State law', href: '/legal' }, { label: 'Law updates' }]}
      title="Law updates"
      description={
        state
          ? `Curated notes on changes to ${STATE_NAMES[state]} HOA law. Live updates appear on the State law page for every board in ${state}.`
          : 'Curated notes on changes to your state’s HOA law.'
      }
      meta={
        updatesResult?.ok && updates.length > 0 ? (
          <Badge variant="neutral" className="num">
            {live} live · {archived} archived
          </Badge>
        ) : null
      }
      tabs={<LegalTabs current="/legal/updates" />}
      actions={
        state && canEdit ? (
          <Button asChild>
            <Link href="/legal/updates/new">
              <Plus aria-hidden />
              Post update
            </Link>
          </Button>
        ) : null
      }
    >
      {!stateResult.ok ? (
        <LoadFailed what="your association’s state" />
      ) : !state ? (
        <EmptyState
          icon={<Scale aria-hidden />}
          title="Your state isn’t covered yet"
          description="The State Law Brain covers Georgia, Florida, California and Texas today."
        />
      ) : !updatesResult || !updatesResult.ok ? (
        <LoadFailed what="law updates" retryHref="/legal/updates" />
      ) : (
        <>
          {updates.length >= UPDATE_CAP ? (
            <Alert variant="info" title={`Showing the ${UPDATE_CAP} most recent updates`}>
              Older updates aren’t listed here.
            </Alert>
          ) : null}
          <DataTable
            caption="Law updates"
            columns={columns}
            rows={updates}
            rowKey={(u) => u.id}
            mobile="cards"
            linkAs={Link}
            empty={
              <EmptyState
                variant="compact"
                icon={<Megaphone aria-hidden />}
                title="No updates posted yet"
                description="Post a curated note about a recent change in your state’s HOA law."
                action={
                  <Button asChild size="sm">
                    <Link href="/legal/updates/new">Post the first update</Link>
                  </Button>
                }
              />
            }
          />
        </>
      )}
    </Page>
  )
}
