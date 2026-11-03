// Browser-side cleanup that runs just before the Supabase sign-out, so the
// next person on a shared browser inherits nothing from this session.
// Every step is best effort: sign-out must never be blocked by it.

import {
  clearSessionCookiesOnSignOut,
  removeMyPushSubscriptionOnSignOut,
} from '@/app/actions/sign-out'

const RUNTIME_CACHE_PREFIX = 'hoa-runtime-'

export async function clearDeviceStateOnSignOut(): Promise<void> {
  // Impersonation / role-override cookies are HTTPOnly: clear server-side.
  await clearSessionCookiesOnSignOut().catch(() => {})

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager?.getSubscription()
      if (sub) {
        await removeMyPushSubscriptionOnSignOut(sub.endpoint).catch(() => {})
        await sub.unsubscribe().catch(() => false)
      }
      reg?.active?.postMessage({ type: 'CLEAR_RUNTIME_CACHE' })
    }
  } catch {
    // ignore
  }

  try {
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys()
      await Promise.all(
        keys.filter((k) => k.startsWith(RUNTIME_CACHE_PREFIX)).map((k) => caches.delete(k)),
      )
    }
  } catch {
    // ignore
  }
}
