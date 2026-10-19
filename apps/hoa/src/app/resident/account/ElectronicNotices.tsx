'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Switch } from '@homeowner-portal/ui'
import type { ConsentState } from '@/lib/email-consent'
import { setMyEmailConsent } from '@/lib/email-consent-actions'
import { consentSummary } from '@/components/consent/ConsentStatus'
import { Panel, SectionLabel } from '@/components/resident/screen'

/**
 * BL-020: a member's own consent to official association notices by email
 * (CA Civ. Code §4040). Granting or withdrawing appends an evidence row
 * (method 'portal'). Rendered only once M1_APPLIED.
 *
 * `consent`: the member's newest event (null = never chose), or
 * `'failed'` when it couldn't be read — then the switch is not offered,
 * because an unknown state shown as "off" would be a lie.
 */
export function ElectronicNotices({ consent, readOnly = false }: { consent: ConsentState | null | 'failed'; readOnly?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const known = consent !== 'failed'
  const granted = known && consent?.granted === true

  function toggle(next: boolean) {
    setError(null)
    startTransition(async () => {
      const res = await setMyEmailConsent(next)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  const status = known ? consentSummary(consent).detail : null

  return (
    <section className="space-y-2.5" aria-labelledby="e-notices-heading">
      <SectionLabel>
        <span id="e-notices-heading">Notices</span>
      </SectionLabel>
      <Panel className="space-y-3">
        {known ? (
          <Switch
            checked={granted}
            onChange={(e) => toggle(e.target.checked)}
            disabled={pending || readOnly}
            label="Electronic notices"
            description={
              granted
                ? 'Official notices from your association come to you by email.'
                : 'Official notices from your association come to you by mail.'
            }
          />
        ) : (
          <Alert variant="error" title="Couldn’t load your notice preference">
            Reload the page to try again. Until then your association treats you as not having agreed to email notices.
          </Alert>
        )}
        <div className="space-y-1.5 text-xs text-muted">
          <p>
            Official notices are the ones the law requires your association to send — meeting notices, assessments,
            budget and policy changes. In California the association may send them by email only if you agree (Civil
            Code §4040). You can withdraw at any time; notices then come by first-class mail.
          </p>
          {status ? <p>{status}.</p> : known ? <p>You haven’t chosen yet, so notices come by mail.</p> : null}
          {readOnly ? <p>You’re viewing as this resident — only they can change this.</p> : null}
        </div>
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </Panel>
    </section>
  )
}
