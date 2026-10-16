/**
 * What /inbox says about the mailbox history import (BL-005).
 *
 * The state is already stored on mailbox_accounts (`backfill_status`,
 * `backfill_progress`); until now only Settings → Mailbox showed it, so a
 * board on /inbox during a 12-month import had no way to know older mail
 * was still arriving.
 *
 * `total_estimate` is Gmail's resultSizeEstimate — an ESTIMATE that
 * `done` can pass. Once it has, "6,000 of ~5,300" would be a visible lie,
 * so the copy falls back to "N so far".
 */

import type { MailboxStatus } from './queries'

export type MailboxStatusRead = { kind: 'loaded'; status: MailboxStatus } | { kind: 'failed' }

export interface BackfillBanner {
  variant: 'info' | 'warning' | 'error'
  title: string
  body: string
  /** 0–100 when a meaningful fraction exists, else null (no bar). */
  percent: number | null
  action: { href: string; label: string } | null
}

const fmt = (n: number) => n.toLocaleString('en-US')

export function backfillBanner(read: MailboxStatusRead, canManageMailbox: boolean): BackfillBanner | null {
  if (read.kind === 'failed') {
    return {
      variant: 'warning',
      title: 'Couldn’t check the mailbox status',
      body: 'We couldn’t read whether mail is syncing or history is still importing. The conversations below may be incomplete — reload in a minute.',
      percent: null,
      action: null,
    }
  }

  const { status } = read
  switch (status.backfillStatus) {
    case 'done':
      return null

    case 'pending':
      return {
        variant: 'info',
        title: 'Importing history — starting',
        body: 'Older mail will appear here as it is imported. New mail is already syncing.',
        percent: null,
        action: null,
      }

    case 'running': {
      const done = status.backfillDone
      const total = status.backfillTotalEstimate
      const hasTotal = total !== null && total > 0 && done <= total
      return {
        variant: 'info',
        title: hasTotal ? `Importing history — ${fmt(done)} of ~${fmt(total)}` : `Importing history — ${fmt(done)} so far`,
        body: 'Older mail is still arriving, so some past conversations may not be here yet. New mail is already syncing.',
        percent: hasTotal ? Math.min(100, Math.max(0, Math.round((done / total) * 100))) : null,
        action: null,
      }
    }

    case 'failed':
      return {
        variant: 'error',
        title: 'Import failed — retry from Settings',
        body: canManageMailbox
          ? 'We couldn’t finish importing older mail, so some past conversations are missing. New mail keeps syncing. Reconnecting the mailbox restarts the import.'
          : 'We couldn’t finish importing older mail, so some past conversations are missing. New mail keeps syncing. Ask an HOA admin to reconnect the mailbox in Settings.',
        percent: null,
        action: canManageMailbox ? { href: '/settings/mailbox', label: 'Open mailbox settings' } : null,
      }

    default:
      return null
  }
}
