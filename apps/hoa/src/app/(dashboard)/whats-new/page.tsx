import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, EmptyState, LoadFailed, Page } from '@homeowner-portal/ui'
import { AppVersion } from '@/components/layout/AppVersion'
import { MarkWhatsNewSeen } from '@/components/layout/WhatsNewVersionLink'
import { appVersion } from '@/lib/app-version'
import { formatShortDate } from '@/lib/format-datetime'
import { loadReleaseNotes } from '@/lib/release-notes-server'
import { boardWhatsNewByNote, latestBoardWhatsNewId } from '@/lib/guide/whats-new'
import { WhatsNewEntries } from '@/components/guide/WhatsNewEntries'

// BL-071: "What's new", linked from the version line in the sidebar.
// Lists docs/releases/*.md newest first, showing each note's Summary.
// BL-070: a note's user-facing `whats_new:` entries (compiled into the
// guide) show above its summary, each with a "Learn how" guide link.
// Visiting the page marks the newest entry seen (the sidebar dot).

export const metadata = { title: "What's new" }

export default async function WhatsNewPage() {
  const result = await loadReleaseNotes()
  const version = appVersion()
  const entriesByNote = boardWhatsNewByNote()

  return (
    <Page
      width="narrow"
      title="What's new"
      description="Recent changes to HOA Hub."
      meta={<AppVersion version={version} />}
      linkAs={Link}
    >
      <MarkWhatsNewSeen latestId={latestBoardWhatsNewId()} />
      {!result.ok ? (
        <LoadFailed what="the release notes" />
      ) : result.notes.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="Release notes will appear here"
          description="When a new version ships, a short summary of what changed is posted on this page."
          titleAs="h2"
        />
      ) : (
        <div className="space-y-4">
          {result.notes.map((note) => (
            <Card key={note.slug}>
              <CardHeader className="pb-3">
                <CardTitle as="h2">{note.title}</CardTitle>
                {note.date ? (
                  <p className="text-xs text-muted">
                    <time dateTime={note.date}>{formatShortDate(`${note.date}T12:00:00Z`)}</time>
                  </p>
                ) : null}
              </CardHeader>
              {entriesByNote.get(note.slug)?.length ? (
                <CardContent className="pb-4">
                  <WhatsNewEntries entries={entriesByNote.get(note.slug)!} />
                </CardContent>
              ) : null}
              {note.summary.length > 0 ? (
                <CardContent className="space-y-3 text-sm text-foreground-secondary">
                  {note.summary.map((block, i) =>
                    block.type === 'p' ? (
                      <p key={i}>{block.text}</p>
                    ) : (
                      <ul key={i} className="list-disc space-y-1 pl-5">
                        {block.items.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    ),
                  )}
                </CardContent>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </Page>
  )
}
