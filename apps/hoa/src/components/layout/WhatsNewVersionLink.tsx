'use client'

import { useEffect, useState } from 'react'
import type { AppVersion as AppVersionInfo } from '@/lib/app-version'
import {
  WHATS_NEW_SEEN_EVENT,
  isWhatsNewUnread,
  markWhatsNewSeen,
  readWhatsNewSeen,
  storageAvailable,
} from '@/lib/guide/whats-new-seen'
import { AppVersion } from './AppVersion'

/**
 * The sidebar version link to /whats-new, with an unread dot when this
 * browser has not yet seen the newest What's new entry (spec §6.5). The
 * dot is decided after mount, from localStorage, so the server render and
 * first client render agree (no dot) and nothing is stored server-side.
 */
export function WhatsNewVersionLink({
  version,
  latestId,
  className,
}: {
  version: AppVersionInfo
  latestId: string | null
  className?: string
}) {
  const [unread, setUnread] = useState(false)

  useEffect(() => {
    const check = () => setUnread(isWhatsNewUnread(latestId, readWhatsNewSeen(), storageAvailable()))
    check()
    window.addEventListener(WHATS_NEW_SEEN_EVENT, check)
    window.addEventListener('storage', check)
    return () => {
      window.removeEventListener(WHATS_NEW_SEEN_EVENT, check)
      window.removeEventListener('storage', check)
    }
  }, [latestId])

  return <AppVersion version={version} href="/whats-new" compact unread={unread} className={className} />
}

/** Rendered on /whats-new: viewing the page marks the newest entry seen. */
export function MarkWhatsNewSeen({ latestId }: { latestId: string | null }) {
  useEffect(() => {
    if (latestId) markWhatsNewSeen(latestId)
  }, [latestId])
  return null
}
