import Link from 'next/link'
import { ArrowRight, Scale } from 'lucide-react'
import { Badge } from '@homeowner-portal/ui'
import {
  GA_OWNER_RIGHTS,
  GA_OWNER_RIGHTS_INTRO,
  GA_OWNER_RIGHTS_TAKES_EFFECT,
  gaOwnerRightsInForce,
  ownerRightLink,
} from '@/lib/owner-rights/law'
import { Panel } from '@/components/resident/screen'

export const OWNER_RIGHTS_NOT_LEGAL_ADVICE =
  'General information, not legal advice. Your governing documents and other Georgia laws also apply.'

/**
 * BL-164: the twelve § 43-17A-7 rights, each quoted word for word (the
 * quotes are tested against the SB 406 fixture in lib/owner-rights) and
 * linked to where the owner uses it in the portal. Pure: the page decides
 * Georgia and today; this only renders.
 */
export function OwnerRightsView({ today, recordsLive }: { today: string; recordsLive: boolean }) {
  const inForce = gaOwnerRightsInForce(today)
  return (
    <div className="space-y-4">
      <Panel className="space-y-2">
        <p className="text-sm text-foreground">
          {inForce
            ? 'Georgia’s Property Owners’ Bill of Rights lists what every owner in a Georgia owners’ association is entitled to.'
            : `Georgia’s Property Owners’ Bill of Rights ${GA_OWNER_RIGHTS_TAKES_EFFECT}. Until then, your governing documents and the laws in force today apply.`}
        </p>
        <p className="text-xs text-muted">
          {GA_OWNER_RIGHTS_INTRO.cite}: “{GA_OWNER_RIGHTS_INTRO.quote}”
        </p>
      </Panel>

      <ol className="space-y-3">
        {GA_OWNER_RIGHTS.map((r) => {
          const link = ownerRightLink(r.place, recordsLive)
          return (
            <li key={r.n} className="space-y-2 rounded-xl border border-border bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Scale className="size-4 text-primary" aria-hidden />
                <p className="text-sm font-semibold text-foreground">
                  {r.n}. {r.title}
                </p>
                {inForce ? null : <Badge variant="neutral">{GA_OWNER_RIGHTS_TAKES_EFFECT}</Badge>}
              </div>
              <blockquote className="border-l-2 border-border pl-3 text-sm italic text-foreground-secondary">“{r.quote}”</blockquote>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">{r.cite}</span>
                <Link href={link.href} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  {link.label}
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
            </li>
          )
        })}
      </ol>

      <p className="text-xs text-muted">{OWNER_RIGHTS_NOT_LEGAL_ADVICE}</p>
    </div>
  )
}
