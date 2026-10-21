'use client'

import { useState } from 'react'
import { Button } from '@homeowner-portal/ui'
import type { DirectorCertView } from '@/lib/compliance/director-certs'
import { DirectorCertForm, DirectorCertPill, MarkDirectorCertifiedButton } from './director-cert-ui'

/**
 * BL-139: the Members-page list. One row per current board/admin member of
 * a Florida association: status and countdown, "Mark certified", and an
 * edit form for the dates and the document link.
 */
export function DirectorCertPanel({ rows }: { rows: DirectorCertView[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <ul className="divide-y divide-border border-t border-border">
      {rows.map((r) => {
        const name = r.name ?? 'Unnamed member'
        return (
          <li key={r.userId} className="px-5 py-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium text-foreground">{name}</div>
                <div className="mt-1">
                  <DirectorCertPill tone={r.tone} label={r.label} />
                </div>
                {r.electedLabel ? (
                  <p className="mt-1 text-xs text-muted">
                    Elected or appointed {r.electedLabel}. Keep the certificate until at least {r.retainLabel}.{' '}
                    {r.documentUrl ? (
                      <a
                        href={r.documentUrl}
                        className="font-medium text-primary hover:underline"
                        {...(r.documentUrl.startsWith('/') ? {} : { target: '_blank', rel: 'noopener noreferrer' })}
                      >
                        Open certificate
                      </a>
                    ) : (
                      'No certificate link yet.'
                    )}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.electedOn && (!r.certifiedOn || r.tone === 'renewal_soon' || r.tone === 'expired') ? <MarkDirectorCertifiedButton memberId={r.userId} name={name} /> : null}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing(editing === r.userId ? null : r.userId)}
                  aria-expanded={editing === r.userId}
                >
                  {r.electedOn ? 'Edit dates' : 'Add election date'}
                </Button>
              </div>
            </div>
            {editing === r.userId ? (
              <DirectorCertForm
                memberId={r.userId}
                name={name}
                initial={{
                  electedOn: r.electedOn ?? '',
                  certifiedOn: r.certifiedOn ?? '',
                  documentUrl: r.documentUrl ?? '',
                }}
                onDone={() => setEditing(null)}
              />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
