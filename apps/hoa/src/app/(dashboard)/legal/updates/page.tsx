import Link from 'next/link'
import { ArrowLeft, ExternalLink, Plus, Scale } from 'lucide-react'
import { format } from 'date-fns'
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
} from '@homeowner-portal/ui'
import {
  getAssociationState,
  listAllUpdatesForManager,
} from '@/lib/state-law'
import { ArchiveButton } from './ArchiveButton'

export const metadata = { title: 'Law updates — admin' }

export default async function UpdatesAdminPage() {
  const state = await getAssociationState()

  if (!state) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Link
          href="/legal"
          className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <EmptyState
          icon={<Scale className="h-10 w-10" aria-hidden />}
          title="State not supported"
          description="The State Law Brain currently covers GA, FL, CA, and TX."
        />
      </div>
    )
  }

  const updates = await listAllUpdatesForManager(state)
  const live = updates.filter((u) => !u.archived_at).length
  const archived = updates.length - live

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/legal"
        className="inline-flex items-center gap-1 text-sm font-medium text-muted-fg hover:text-muted"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to State Law
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-muted">Law updates — admin</h1>
          <p className="text-sm text-muted-fg">
            {state} · {live} live · {archived} archived
          </p>
        </div>
        <Button asChild>
          <Link href="/legal/updates/new">
            <Plus className="h-4 w-4" />
            Post update
          </Link>
        </Button>
      </header>

      {updates.length === 0 ? (
        <EmptyState
          icon={<Plus className="h-10 w-10" aria-hidden />}
          title="No updates posted yet"
          description="Post a curated note about a recent change in your state's HOA law. It will appear on the /legal landing page and in the dashboard."
          action={
            <Button asChild>
              <Link href="/legal/updates/new">
                <Plus className="h-4 w-4" />
                Post first update
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {updates.map((u) => (
              <li key={u.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-muted">
                      {u.headline}
                      {u.archived_at ? (
                        <Badge variant="outline" size="sm" className="ml-2">
                          archived
                        </Badge>
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-fg">
                      Posted {format(new Date(u.posted_at), 'PP')}
                      {u.category ? ` · ${u.category}` : ''}
                      {u.effective_date
                        ? ` · effective ${format(new Date(u.effective_date), 'PP')}`
                        : ''}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">
                      {u.summary}
                    </p>
                    {u.source_url ? (
                      <a
                        href={u.source_url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Source
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                  <ArchiveButton updateId={u.id} archived={!!u.archived_at} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
