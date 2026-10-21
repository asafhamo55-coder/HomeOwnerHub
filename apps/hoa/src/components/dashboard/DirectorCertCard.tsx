import Link from 'next/link'
import { ExternalLink, GraduationCap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'
import {
  DIRECTOR_CERT_OFFICIAL_LABEL,
  DIRECTOR_CERT_OFFICIAL_URL,
  directorCertConsequence,
  type DirectorCertRow,
} from '@/lib/compliance/director-certs'
import { DirectorCertPill, MarkDirectorCertifiedButton } from '@/components/compliance/director-cert-ui'
import { FailedNote } from './BreakdownList'

/**
 * BL-139: Florida directors whose certificate is due within 30 days, overdue,
 * or past its 4-year validity (Fla. Stat. § 720.3033(1)). Board-facing only.
 * Renders nothing when nobody is in that window; `alerts` null = the read failed.
 */
export function DirectorCertCard({ alerts }: { alerts: DirectorCertRow[] | null }) {
  if (alerts !== null && alerts.length === 0) return null
  return (
    <Card id="director-certification">
      <CardHeader className="pb-3">
        <CardTitle as="h2" className="flex items-center gap-2">
          <GraduationCap className="size-4 text-muted" aria-hidden />
          Director certification
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {alerts === null ? (
          <FailedNote what="director certification" />
        ) : (
          <>
            {alerts.map((r) => {
              const name = r.name ?? 'Unnamed member'
              return (
                <section key={r.userId} aria-label={name} className="space-y-1.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 font-medium text-foreground">{name}</h3>
                    <DirectorCertPill tone={r.status.tone} label={r.status.label} />
                  </div>
                  <p className="text-foreground-secondary">{directorCertConsequence(r.status.tone)}</p>
                  <MarkDirectorCertifiedButton memberId={r.userId} name={name} />
                </section>
              )
            })}
            <p className="text-xs text-muted">
              Fla. Stat. § 720.3033(1). Informational, not legal advice.{' '}
              <Link href="/settings/members#director-certification" className="font-medium text-primary hover:underline">
                Dates and certificates on Members
              </Link>
              {' · '}
              <a
                href={DIRECTOR_CERT_OFFICIAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                {DIRECTOR_CERT_OFFICIAL_LABEL} <ExternalLink className="size-3" aria-hidden />
              </a>
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
