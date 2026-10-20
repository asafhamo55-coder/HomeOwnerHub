import { Alert } from '@homeowner-portal/ui'
import { NOT_LEGAL_ADVICE, type NoticeCheck } from '@/lib/meetings/notice-law'

const VARIANT: Record<NoticeCheck['level'], 'info' | 'success' | 'warning' | 'error'> = {
  short: 'error',
  caution: 'warning',
  ok: 'success',
  bylaws: 'info',
  exempt: 'info',
  past: 'warning',
}

const TITLE: Record<NoticeCheck['level'], string> = {
  short: 'Too late for the minimum notice',
  caution: 'Check the notice period',
  ok: 'Enough notice',
  bylaws: 'Check your bylaws',
  exempt: 'Emergency meeting',
  past: 'This meeting has passed',
}

/**
 * BL-118: the state's minimum meeting notice, checked against today. Each
 * citation is quoted from the statute text in the repo
 * (lib/meetings/notice-law.ts). Server- and client-safe.
 */
export function NoticeLawAlert({ check }: { check: NoticeCheck }) {
  return (
    <Alert variant={VARIANT[check.level]} title={TITLE[check.level]}>
      <p>{check.message}</p>
      {check.citations.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium">What the statute says</summary>
          <ul className="mt-1 space-y-1.5 text-xs">
            {check.citations.map((c) => (
              <li key={`${c.cite}|${c.quote.slice(0, 24)}`}>
                <span className="font-semibold">{c.cite}:</span> “{c.quote}”
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="mt-1 text-xs">{NOT_LEGAL_ADVICE}</p>
    </Alert>
  )
}
