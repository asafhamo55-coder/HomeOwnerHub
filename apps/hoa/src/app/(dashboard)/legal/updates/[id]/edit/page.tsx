import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Scale } from 'lucide-react'
import { Card, CardContent, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { isPlatformAdmin } from '@/lib/platform-admin'
import { getLawUpdateForEdit, listStatutesForState } from '@/lib/state-law'
import { tryLoad } from '@/lib/load-or-fail'
import { STATE_NAMES } from '@/lib/status/knowledge'
import { NewUpdateForm } from '../../new/NewUpdateForm'

export const metadata = { title: 'Edit law update' }

export default async function EditLawUpdatePage({ params }: { params: Promise<{ id: string }> }) {
  // Law updates are one platform-wide feed: only the platform team edits.
  if (!(await isPlatformAdmin())) redirect('/legal/updates')
  const { id } = await params

  const updateResult = await tryLoad('law update', () => getLawUpdateForEdit(id))
  if (updateResult.ok && !updateResult.data) notFound()
  const update = updateResult.ok ? updateResult.data : null
  const statutesResult = update ? await tryLoad('statutes', () => listStatutesForState(update.state)) : null

  return (
    <Page
      width="narrow"
      linkAs={Link}
      breadcrumbs={[
        { label: 'State law', href: '/legal' },
        { label: 'Law updates', href: '/legal/updates' },
        { label: 'Edit' },
      ]}
      title="Edit law update"
      description={
        update
          ? `Changes show on the State law page for every ${STATE_NAMES[update.state]} board as soon as you save.`
          : 'Change the wording, dates or links on a posted update.'
      }
    >
      {!updateResult.ok ? (
        <LoadFailed what="this law update" retryHref={`/legal/updates/${id}/edit`} />
      ) : !update ? (
        <EmptyState icon={<Scale aria-hidden />} title="Update not found" />
      ) : (
        <Card>
          <CardContent className="p-5 sm:p-6">
            <NewUpdateForm
              initial={update}
              statutes={statutesResult?.ok ? statutesResult.data : []}
              statutesFailed={!statutesResult?.ok}
            />
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
