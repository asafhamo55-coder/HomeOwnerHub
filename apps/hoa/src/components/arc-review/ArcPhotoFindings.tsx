import { Camera } from 'lucide-react'
import { StatusPill } from '@homeowner-portal/ui'
import type { ArcPhotoFinding } from '@/lib/arc-review/model'

// BL-079 — what the AI read from the attached photos, grouped by the photo
// each finding came from. Board-only (the AI review card). Presentational.
// Findings are estimates — low or medium confidence, never high — so the
// card says so and links each group to its photo for the board to check.

export interface ArcPhotoLink {
  fileName: string
  url: string | null
}

const CONFIDENCE: Record<ArcPhotoFinding['confidence'], { tone: 'neutral' | 'info'; label: string }> = {
  low: { tone: 'neutral', label: 'Low confidence' },
  medium: { tone: 'info', label: 'Medium confidence' },
}

export function ArcPhotoFindings({
  findings,
  photos,
  headingId,
}: {
  findings: ArcPhotoFinding[]
  /** The application's attachments by id, to name and link each photo. */
  photos?: Record<string, ArcPhotoLink>
  headingId: string
}) {
  if (findings.length === 0) return null
  const groups = new Map<string, { label: string; items: ArcPhotoFinding[] }>()
  for (const f of findings) {
    const g = groups.get(f.attachmentId) ?? { label: f.photo, items: [] }
    g.items.push(f)
    groups.set(f.attachmentId, g)
  }
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-xs font-medium uppercase tracking-wide text-muted">
        What the photos suggest
      </h3>
      <p className="text-xs leading-relaxed text-foreground-secondary">
        Read automatically from the attached photos. These are estimates — open the photo before relying on one.
      </p>
      <ul className="space-y-2">
        {[...groups.entries()].map(([id, g]) => {
          const link = photos?.[id]
          return (
            <li key={id} className="rounded-lg border border-border bg-surface p-3">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-foreground">
                <Camera className="size-4 shrink-0 text-muted" aria-hidden />
                <span className="shrink-0">{g.label}</span>
                {link ? (
                  link.url ? (
                    <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 truncate font-normal text-primary underline-offset-2 hover:underline">
                      {link.fileName}
                    </a>
                  ) : (
                    <span className="min-w-0 truncate font-normal text-foreground-secondary">{link.fileName}</span>
                  )
                ) : null}
              </p>
              <ul className="mt-2 space-y-2">
                {g.items.map((f) => (
                  <li key={f.finding} className="space-y-1">
                    <p className="text-sm leading-relaxed text-foreground">{f.finding}</p>
                    <StatusPill tone={CONFIDENCE[f.confidence].tone} label={CONFIDENCE[f.confidence].label} icon={null} />
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
